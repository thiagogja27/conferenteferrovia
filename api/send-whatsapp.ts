export const config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const { provider, phone, apiKey, webhookUrl, webhookSecret, text, payload } = body || {};

    if (provider === "callmebot") {
      if (!phone || !apiKey || !text) {
        return res.status(400).json({
          error: "Parâmetros incompletos para CallMeBot (telefone, apiKey e texto são obrigatórios)."
        });
      }

      const cleanPhone = String(phone).replace(/[^0-9+]/g, "");
      const encodedText = encodeURIComponent(text);
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone)}&text=${encodedText}&apikey=${encodeURIComponent(String(apiKey).trim())}`;

      const response = await fetch(url, { method: "GET" });
      const respText = await response.text();

      if (!response.ok || respText.toLowerCase().includes("error") || respText.toLowerCase().includes("invalid apikey")) {
        return res.status(400).json({
          error: respText || "Falha ao enviar mensagem via CallMeBot. Verifique se o telefone e a ApiKey estão corretos.",
          raw: respText,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Mensagem encaminhada ao WhatsApp via CallMeBot com sucesso!",
        raw: respText,
      });
    } else if (provider === "webhook") {
      if (!webhookUrl || !String(webhookUrl).startsWith("http")) {
        return res.status(400).json({ error: "URL de Webhook inválida." });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (webhookSecret) {
        headers["Authorization"] = `Bearer ${webhookSecret}`;
        headers["X-Webhook-Secret"] = String(webhookSecret);
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload || { text, timestamp: new Date().toISOString() }),
      });

      const respText = await response.text();
      return res.status(200).json({
        success: response.ok,
        status: response.status,
        response: respText,
      });
    }

    return res.status(400).json({ error: "Provedor de WhatsApp inválido (use 'callmebot' ou 'webhook')." });
  } catch (err: any) {
    console.error("Erro no handler /api/send-whatsapp:", err);
    return res.status(500).json({
      error: err.message || "Erro inesperado ao disparar notificação de WhatsApp."
    });
  }
}
