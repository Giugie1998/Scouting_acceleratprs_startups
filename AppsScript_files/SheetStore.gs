// Layer minimo di accesso al Google Sheet: lettura -> mappa per website, append idempotente.

function getScheda_(nomeScheda) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scheda = ss.getSheetByName(nomeScheda);
  if (!scheda) throw new Error("Scheda non trovata: " + nomeScheda);
  return scheda;
}

function leggiValori_(scheda) {
  // getDataRange() e' OK per prototipo; se il foglio cresce, meglio range piu' mirato.
  return scheda.getDataRange().getValues();
}

function trovaIndiceColonna_(intestazioni, nomeColonna) {
  var target = String(nomeColonna || "").trim().toLowerCase();
  if (!target) throw new Error("nomeColonna vuoto");

  for (var i = 0; i < intestazioni.length; i++) {
    var corrente = String(intestazioni[i] || "").trim().toLowerCase();
    if (corrente === target) return i;
  }
  return -1;
}

function creaMappaWebsiteARiga_(valoriConHeader, indiceWebsiteZeroBased) {
  var mappa = new Map(); // key: website normalizzata -> value: numero riga (1-based) sul foglio
  if (!valoriConHeader || valoriConHeader.length < 2) return mappa;

  for (var i = 1; i < valoriConHeader.length; i++) {
    var website = valoriConHeader[i][indiceWebsiteZeroBased];
    var chiave = normalizeWebsite(website);
    if (!chiave) continue;
    if (!mappa.has(chiave)) mappa.set(chiave, i + 1);
  }

  return mappa;
}

function preparaContestoScheda_(nomeScheda) {
  var scheda = getScheda_(nomeScheda);
  var valori = leggiValori_(scheda);

  if (!valori || valori.length === 0) {
    throw new Error(
      "Scheda vuota (manca header). Aggiungi almeno la riga header in: " + nomeScheda
    );
  }

  var intestazioni = valori[0];
  var indiceWebsite = trovaIndiceColonna_(intestazioni, "website");
  if (indiceWebsite === -1) {
    throw new Error("Colonna 'website' non trovata nella scheda: " + nomeScheda);
  }

  return {
    nomeScheda: nomeScheda,
    scheda: scheda,
    intestazioni: intestazioni,
    indiceWebsite: indiceWebsite,
    mappaWebsiteARiga: creaMappaWebsiteARiga_(valori, indiceWebsite),
  };
}

/**
 * Appende una riga solo se la website (normalizzata) non esiste gia' in scheda.
 *
 * record: oggetto { website, name, country, ... } i cui campi devono corrispondere ai nomi colonna.
 * Ritorna { inserita: boolean, motivo?: string, riga?: number }.
 */
function appendIdempotente_(contesto, record) {
  var website = record && record.website;
  var chiave = normalizeWebsite(website);
  if (!chiave) return { inserita: false, motivo: "website vuota o non valida" };

  if (contesto.mappaWebsiteARiga.has(chiave)) {
    return { inserita: false, motivo: "duplicato", riga: contesto.mappaWebsiteARiga.get(chiave) };
  }

  // Scrive nella prima riga "libera" basata sulla colonna website (non usa appendRow, che non riempie i buchi).
  var rigaTarget = trovaPrimaRigaVuotaPerColonna_(contesto.scheda, contesto.indiceWebsite + 1);

  var rigaCorrente = contesto.scheda
    .getRange(rigaTarget, 1, 1, contesto.intestazioni.length)
    .getValues()[0];

  var riga = (rigaCorrente && rigaCorrente.length)
    ? rigaCorrente.slice()
    : new Array(contesto.intestazioni.length).fill("");

  for (var i = 0; i < contesto.intestazioni.length; i++) {
    var nomeColonna = String(contesto.intestazioni[i] || "").trim();
    if (!nomeColonna) continue;
    // Permette header tipo "Website" ma record con chiavi lowercase (e viceversa).
    var valore =
      record[nomeColonna] !== undefined
        ? record[nomeColonna]
        : record[nomeColonna.toLowerCase()];
    if (valore === undefined) continue;
    riga[i] = valore;
  }

  contesto.scheda
    .getRange(rigaTarget, 1, 1, contesto.intestazioni.length)
    .setValues([riga]);

  contesto.mappaWebsiteARiga.set(chiave, rigaTarget);

  return { inserita: true, riga: rigaTarget };
}

function trovaPrimaRigaVuotaPerColonna_(scheda, indiceColonnaUnoBased) {
  // Trova l'ultima riga realmente usata nella colonna chiave (evita "lastRow" falsato da formule altrove).
  var maxRows = scheda.getMaxRows();
  var lastNonEmpty = scheda
    .getRange(maxRows, indiceColonnaUnoBased)
    .getNextDataCell(SpreadsheetApp.Direction.UP)
    .getRow();

  // Se c'e' solo header o colonna vuota, la prima riga disponibile e' 2.
  if (lastNonEmpty < 2) return 2;

  var num = lastNonEmpty - 1;
  var valori = scheda.getRange(2, indiceColonnaUnoBased, num, 1).getValues();
  for (var i = 0; i < valori.length; i++) {
    var v = String(valori[i][0] || "").trim();
    if (!v) return i + 2;
  }

  return lastNonEmpty + 1;
}
