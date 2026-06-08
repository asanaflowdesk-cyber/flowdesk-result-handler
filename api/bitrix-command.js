function setDeep(obj, key, value) {
  const parts = key.replace(/\]/g, "").split("[");
  let cur = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p]) cur[p] = {};
    cur = cur[p];
  }

  cur[parts[parts.length - 1]] = value;
}

function normalizePayload(body) {
  if (!body) return {};

  if (typeof body === "string") {
    const obj = {};
    const params = new URLSearchParams(body);
    for (const [key, value] of params.entries()) {
      setDeep(obj, key, value);
    }
    return obj;
  }

  const obj = {};
  for (const [key, value] of Object.entries(body)) {
    if (key.includes("[")) setDeep(obj, key, value);
    else obj[key] = value;
  }

  return obj;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "FlowDesk result handler is alive" });
  }

  try {
    const payload = normalizePayload(req.body);

    const commandText =
      payload?.data?.command?.params ||
      payload?.COMMAND_PARAMS ||
      payload?.PARAMS ||
      "";

    const chat = payload?.data?.chat || {};
    const taskId =
      chat.entityId ||
      chat.ENTITY_ID ||
      payload?.TASK_ID ||
      "";

    const text = String(commandText).trim();

    if (!text) {
      return res.status(400).json({
        ok: false,
        error: "empty_result_text",
        message: "Текст после команды пустой"
      });
    }

    if (!taskId) {
      return res.status(400).json({
        ok: false,
        error: "task_id_not_found",
        message: "Не найден ID задачи в событии",
        payload
      });
    }

    const bitrixBase = process.env.BITRIX_WEBHOOK_URL;
    const resultField = process.env.RESULT_FIELD;

    if (!bitrixBase || !resultField) {
      return res.status(500).json({
        ok: false,
        error: "missing_env",
        message: "Не заданы BITRIX_WEBHOOK_URL или RESULT_FIELD"
      });
    }

    const base = bitrixBase.endsWith("/") ? bitrixBase : bitrixBase + "/";

    const updateResponse = await fetch(base + "tasks.task.update.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        taskId: Number(taskId),
        fields: {
          [resultField]: text
        }
      })
    });

    const updateJson = await updateResponse.json();

    if (updateJson.error) {
      return res.status(400).json({
        ok: false,
        error: updateJson.error,
        description: updateJson.error_description,
        bitrix: updateJson
      });
    }

    return res.status(200).json({
      ok: true,
      taskId,
      savedText: text,
      field: resultField
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "handler_failed",
      message: error.message
    });
  }
}
