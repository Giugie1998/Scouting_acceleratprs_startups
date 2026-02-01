function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Startup Scouting AI")
    .addItem("Setup LLM API Key", "setupLLMKey_")
    .addSeparator()
    .addItem("Scouting accelerators", "menuScoutingAccelerators")
    .addItem("Aggiorna startups dagli acceleratori", "menuAggiornaStartups")
    .addItem("Genera value proposition mancanti", "menuGeneraValueProposition")
    .addToUi();
}

function menuScoutingAccelerators() {
  scoutingAccelerators_();
}

function menuAggiornaStartups() {
  aggiornaStartupsDaAccelerators_();
}

function menuGeneraValueProposition() {
  generaValuePropositionMancanti_();
}
