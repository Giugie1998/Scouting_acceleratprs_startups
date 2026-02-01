function scoutingAccelerators_() {
  scoutingAcceleratorsOnlineFirst_({ batchSize: 10 });
}

function aggiornaStartupsDaAccelerators_() {
  aggiornaStartupsDaAcceleratorsEuristico_({
    maxAcceleratori: 10,
    maxStartupsPerAcceleratore: 25,
    maxNuoveStartupsTotali: 50,
  });
}

function generaValuePropositionMancanti_() {
  generaValuePropositionMancantiLLM_({
    maxStartups: 20,
    sleepMs: 250,
  });
}
