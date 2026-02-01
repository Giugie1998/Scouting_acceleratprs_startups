// Gestione segreti via PropertiesService (niente chiavi hardcoded nel repo).

var CHIAVE_API_LLM = "LLM_API_KEY";
var MODELLO_LLM = "LLM_MODEL"; // opzionale, default nel getter
var URL_API_LLM = "LLM_API_URL"; // opzionale, default nel getter
var OPENROUTER_HTTP_REFERER = "OPENROUTER_HTTP_REFERER"; // opzionale
var OPENROUTER_X_TITLE = "OPENROUTER_X_TITLE"; // opzionale

function setSegreto_(chiave, valore) {
  if (!chiave) throw new Error("chiave vuota");
  if (valore === null || valore === undefined) throw new Error("valore vuoto");
  PropertiesService.getScriptProperties().setProperty(String(chiave), String(valore));
}

function getSegreto_(chiave) {
  if (!chiave) throw new Error("chiave vuota");
  var valore = PropertiesService.getScriptProperties().getProperty(String(chiave));
  return valore ? String(valore).trim() : "";
}

function validaSegretiLLM_() {
  var apiKey = getSegreto_(CHIAVE_API_LLM);
  if (!apiKey) {
    throw new Error(
      "Manca la chiave LLM. Imposta Script Properties: " +
        CHIAVE_API_LLM +
        " (Apps Script -> Project Settings -> Script properties)."
    );
  }
  return {
    apiKey: apiKey,
    modello: getModelloLLM_(),
    apiUrl: getUrlApiLLM_(),
    openrouterReferer: getOpenRouterReferer_(),
    openrouterTitle: getOpenRouterTitle_(),
  };
}

function getModelloLLM_() {
  var modello = getSegreto_(MODELLO_LLM);
  // Default: OpenRouter modello free richiesto dall'utente.
  return modello || "openai/gpt-oss-20b:free";
}

function getUrlApiLLM_() {
  var url = getSegreto_(URL_API_LLM);
  // Default: OpenRouter (compatibile OpenAI Chat Completions).
  return url || "https://openrouter.ai/api/v1/chat/completions";
}

function getOpenRouterReferer_() {
  return getSegreto_(OPENROUTER_HTTP_REFERER);
}

function getOpenRouterTitle_() {
  return getSegreto_(OPENROUTER_X_TITLE);
}

// Helper manuale: ti chiede la chiave e la salva in Script Properties.
function setupLLMKey_() {
  var ui = SpreadsheetApp.getUi();
  var risposta = ui.prompt(
    "Setup LLM API Key",
    "Inserisci la tua chiave (es. OpenRouter) e premi OK (verra' salvata in Script Properties).",
    ui.ButtonSet.OK_CANCEL
  );
  if (risposta.getSelectedButton() !== ui.Button.OK) return;

  var chiave = String(risposta.getResponseText() || "").trim();
  if (!chiave) {
    ui.alert("Chiave vuota: nessuna modifica salvata.");
    return;
  }

  setSegreto_(CHIAVE_API_LLM, chiave);
  ui.alert("Salvata in Script Properties: " + CHIAVE_API_LLM);
}
