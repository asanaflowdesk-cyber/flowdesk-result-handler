const RESULT_FIELD = process.env.RESULT_FIELD || "UF_AUTO_193837238782";
const BITRIX_WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;

function setDeep(obj, key, value) {
  const parts = key.replace(/\]/g, "").split("[");
  let cur = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!cur[part]) cur[part] = {};
    cur = cur[part];
  }

  cur[parts[parts.length - 1]] = value;
}

function normalizeBody(body) {
  if (!body) return {};

  if (typeof body === "object") {
    const obj = {};
    for (const [key, value] of Object.entries(body)) {
      if (key.includes("[")) {
        setDeep(obj, key, value);
      } else {
        obj[key] = value;
      }
    }
    return obj;
  }

  if (typeof body === "string") {
    const obj = {};
    const params = new URLSearchParams(body);

    for (const [key, value] of params.entries()) {
      if (key.includes("[")) {
        setDeep(obj, key, value);
      } else {
        obj[key] = value;
      }
    }

    return obj;
  }

  return {};
}

function findText(payload) {
  const candidates = [
    payload?.data?.COMMAND?.result?.COMMAND_PARAMS,
    payload?.data?.COMMAND?.["26"]?.COMMAND_PARAMS,
    payload?.data?.COMMAND_PARAMS,
    payload?.COMMAND_PARAMS,
    payload?.command_params,
    payload?.PARAMS,
    payload?.data?.PARAMS?.MESSAGE
  ];

  for (const value of candidates) {
    if (value && String(value).trim()) {
      return String(value)
        .replace(/^\/результат\s*/i, "")
        .trim();
    }
  }

  return "";
}

function findTaskId(payload) {
  const candidates = [
    payload?.data?.PARAMS?.CHAT_ENTITY_ID,
    payload?.data?.PARAMS?.CHAT_ENTITY_DATA_1,
    payload?.data?.PARAMS?.CHAT_ENTITY_DATA_2,
    payload?.CHAT_ENTITY_ID,
    payload?.CHAT_ENTITY_DATA_1,
    payload?.CHAT_ENTITY_DATA_2,
    payload?.TASK_ID,
    payload?.taskId
  ];

  for (const value of candidates) {
    if (!value) continue;

    const match = String(value).match(/\d+/);
    if (match) return match[0];
  }

  return "";
}

module.exports = async function handler(req, res) {
  console.log("=== FLOWDESK HANDLER START ===");
  console.log("METHOD:", req.method);
  console.log("QUERY:", JSON.stringify(req.query));
  console.log("BODY RAW:", JSON.stringify(req.body));

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "handler alive"
    });
  }

  try {
    const payload = normalizeBody(req.body);

    console.log("PAYLOAD:", JSON.stringify(payload, null, 2));

    const text = findText(payload);
    const taskId = findTaskId(payload);

    console.log("EXTRACTED:", JSON.stringify({
      taskId,
      text,
      resultField: RESULT_FIELD
    }));

    if (!BITRIX_WEBHOOK_URL) {
      return res.status(200).json({
        ok: false,
        error: "BITRIX_WEBHOOK_URL is empty"
      });
    }

    if (!taskId) {
      return res.status(200).json({
        ok: false,
        error: "taskId not found",
        payload
      });
    }

    if (!text) {
      return res.status(200).json({
        ok: false,
        error: "text not found",
        payload
      });
    }

    const base = BITRIX_WEBHOOK_URL.endsWith("/")
      ? BITRIX_WEBHOOK_URL
      : BITRIX_WEBHOOK_URL + "/";

    const bitrixResponse = await fetch(base + "tasks.task.update.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        taskId: Number(taskId),
        fields: {
          [RESULT_FIELD]: text
        }
      })
    });

    const bitrixJson = await bitrixResponse.json();

    console.log("BITRIX RESPONSE:", JSON.stringify(bitrixJson, null, 2));

    return res.status(200).json({
      ok: true,
      taskId,
      text,
      bitrix: bitrixJson
    });
  } catch (error) {
    console.error("ERROR:", error);

    return res.status(200).json({
      ok: false,
      error: error.message
    });
  }
};
