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
      if (key.includes("[")) setDeep(obj, key, value);
      else obj[key] = value;
    }
    return obj;
  }

  if (typeof body === "object") {
    const obj = {};
    for (const [key, value] of Object.entries(body)) {
      if (key.includes("[")) setDeep(obj, key, value);
      else obj[key] = value;
    }
    return obj;
  }

  return {};
}

function getFirstCommand(payload) {
  const commands = payload?.data?.COMMAND;

  if (!commands || typeof commands !== "object") {
    return null;
  }

  const firstKey = Object.keys(commands)[0];
  return commands[firstKey] || null;
}

function extractTaskId(payload) {
  const params = payload?.data?.PARAMS || {};

  const candidates = [
    params.CHAT_ENTITY_ID,
    params.chat_entity_id,
    payload?.CHAT_ENTITY_ID,
    payload?.chat_entity_id,
    payload?.taskId,
    payload?.TASK_ID
  ];

  for (const value of candidates) {
    if (!value) continue;

    const match = String(value).match(/\d+/);
    if (match) return match[0];
  }

  return "";
}

function extractCommandText(payload) {
  const command = getFirstCommand(payload);

  const candidates = [
    command?.COMMAND_PARAMS,
    command?.command_params,
    payload?.COMMAND_PARAMS,
    payload?.command_params,
    payload?.data?.COMMAND_PARAMS,
    payload?.data?.command_params
  ];

  for (const value of candidates) {
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  const fullMessage = payload?.data?.PARAMS?.MESSAGE || "";
  return String(fullMessage)
    .replace(/^\/result\s*/i, "")
    .trim();
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "FlowDesk result handler is alive"
    });
  }

  try {
    const payload = normalizePayload(req.body);

    console.log("QUERY:", JSON.stringify(req.query, null, 2));
    console.log("PAYLOAD:", JSON.stringify(payload, null, 2));

    const bitrixBase = process.env.BITRIX_WEBHOOK_URL;
    const resultField = process.env.RESULT_FIELD || "UF_AUTO_193837238782";

    if (!bitrixBase) {
      return res.status(200).json({
        ok: false,
        error: "missing_BITRIX_WEBHOOK_URL"
      });
    }

    const text = extractCommandText(payload);
    const taskId = extractTaskId(payload);

    console.log("EXTRACTED:", JSON.stringify({ taskId, text, resultField }, null, 2));

    if (!text) {
      return res.status(200).json({
        ok: false,
        error: "empty_command_text",
        hint: "Пиши так: /result текст результата"
      });
    }

    if (!taskId) {
      return res.status(200).json({
        ok: false,
        error: "task_id_not_found",
        hint: "Не нашли ID задачи в CHAT_ENTITY_ID. Смотри PAYLOAD в логах."
      });
    }

    const base = bitrixBase.endsWith("/") ? bitrixBase : bitrixBase + "/";

    const response = await fetch(base + "tasks.task.update.json", {
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

    const json = await response.json();

    console.log("BITRIX_UPDATE_RESPONSE:", JSON.stringify(json, null, 2));

    if (json.error) {
      return res.status(200).json({
        ok: false,
        error: json.error,
        description: json.error_description,
        bitrix: json
      });
    }

    return res.status(200).json({
      ok: true,
      taskId,
      field: resultField,
      savedText: text
    });
  } catch (error) {
    console.error("HANDLER_ERROR:", error);

    return res.status(200).json({
      ok: false,
      error: "handler_failed",
      message: error.message
    });
  }
}
