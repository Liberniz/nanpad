/**
 * 验证失败保留已加密保存的来源，由用户在来源卡片中重试。
 * @param {Pick<import("./usage").UsageBridge, "add" | "refresh">} api
 * @param {Record<string, string>} input
 */
export async function saveAndVerifyUsageSource(api, input) {
  const source = await api.add(input);
  try {
    await api.refresh(source.id);
    return { source, verified: true, error: "" };
  } catch (error) {
    return {
      source,
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
