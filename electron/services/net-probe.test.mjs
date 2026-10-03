import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { probeService } from "./net-probe.mjs";

function fixture(handler) {
  const server = createServer(handler);
  return {
    server,
    async url() {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      return `http://127.0.0.1:${server.address().port}/`;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("HTTP 可达返回状态码与耗时", async () => {
  const f = fixture((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("hello");
  });
  const url = await f.url();
  try {
    const result = await probeService({ url });
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(typeof result.responseMs, "number");
    assert.equal(result.keywordFound, undefined);
    assert.ok(result.at);
  } finally {
    await f.close();
  }
});

test("关键词命中与未命中", async () => {
  const f = fixture((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>nanpad alive</body></html>");
  });
  const url = await f.url();
  try {
    const hit = await probeService({ url, expectedKeyword: "alive" });
    assert.equal(hit.keywordFound, true);
    const miss = await probeService({ url, expectedKeyword: "no-such-word" });
    assert.equal(miss.keywordFound, false);
  } finally {
    await f.close();
  }
});

test("非法地址直接报错", async () => {
  await assert.rejects(() => probeService({ url: "not a url" }), /服务地址无效/);
  await assert.rejects(() => probeService({ url: "ftp://example.com/x" }), /只支持 HTTP/);
});

test("连不上的地址抛错", async () => {
  await assert.rejects(
    () => probeService({ url: "http://127.0.0.1:1/" }),
    (error) => error instanceof Error,
  );
});
