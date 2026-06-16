const { google } = require("googleapis");

// ─── Autenticação via variáveis de ambiente do Netlify ───────────────────────
// No painel Netlify: Site → Environment Variables → adicione:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   → email da service account
//   GOOGLE_PRIVATE_KEY             → chave privada (com \n reais, não literais)
//   GOOGLE_SHEET_ID                → ID da planilha (da URL do Sheets)
//   APP_PASSWORD                   → senha do login do seu painel

function getAuthClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return auth;
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight CORS
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const acao = event.httpMethod === "GET"
    ? new URLSearchParams(event.rawQuery || "").get("acao")
    : JSON.parse(event.body || "{}").acao;

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  // A função valida a senha internamente — NUNCA devolve a senha ao frontend
  if (acao === "login") {
    const { email, senha } = JSON.parse(event.body);
    if (senha !== process.env.APP_PASSWORD) {
      return { statusCode: 401, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // ── LER dados da planilha ────────────────────────────────────────────────────
  if (acao === "ler") {
    const sheets = google.sheets({ version: "v4", auth: getAuthClient() });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Turnos!A2:F",        // linha 1 = cabeçalho, lê a partir da 2
    });

    const rows = (res.data.values || []).map(r => ({
      dataRef:      r[0] || "",
      prefixo:      r[1] || "",
      inicioTurno:  r[2] || "",
      fimIntervalo: r[3] || "",
      tempoMinutos: r[4] || "0",
      motivo:       r[5] || "",
    }));

    return { statusCode: 200, headers, body: JSON.stringify(rows) };
  }

  // ── SALVAR novos registros (append) ──────────────────────────────────────────
  if (acao === "salvar") {
    const { dados } = JSON.parse(event.body);
    const sheets = google.sheets({ version: "v4", auth: getAuthClient() });

    const values = dados.map(r => [
      r.dataRef, r.prefixo, r.inicioTurno, r.fimIntervalo, r.tempoMinutos, r.motivo || ""
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Turnos!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // ── EDITAR uma linha específica ───────────────────────────────────────────────
  if (acao === "editar") {
    const { linhaIndex, itemAlterado } = JSON.parse(event.body);
    const sheets = google.sheets({ version: "v4", auth: getAuthClient() });
    const linha = linhaIndex + 2; // +1 cabeçalho +1 base-1 do Sheets

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Turnos!A${linha}:F${linha}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          itemAlterado.dataRef,
          itemAlterado.prefixo,
          itemAlterado.inicioTurno,
          itemAlterado.fimIntervalo,
          itemAlterado.tempoMinutos,
          itemAlterado.motivo || ""
        ]]
      },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ erro: "Ação desconhecida" }) };
};
