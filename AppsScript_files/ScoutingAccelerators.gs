function scoutingAcceleratorsOnlineFirst_(opzioni) {
  var batchSize = (opzioni && opzioni.batchSize) || 10;
  var run = creaRun_("accelerators");

  var contesto = preparaContestoScheda_("accelerators");
  var candidati = getAcceleratoriDaFTBatch_({ batchSize: batchSize });
  run.info("sorgente=FT url=%s", getAcceleratorsSourceUrl_());
  if (!candidati.length) run.warn("Nessun acceleratore trovato dalla fonte online (FT).");

  for (var i = 0; i < candidati.length; i++) {
    if ((run.contatori.inseriti || 0) >= batchSize) break;

    var acceleratore = candidati[i];
    var esito = appendIdempotente_(contesto, acceleratore);

    if (esito.inserita) {
      run.inc("inseriti");
      run.info(
        "INSERITO riga=%s website=%s name=%s",
        esito.riga,
        acceleratore.website,
        acceleratore.name
      );
      continue;
    }

    if (esito.motivo === "duplicato") {
      run.inc("duplicati");
      run.info(
        "SKIP duplicato riga=%s website=%s",
        esito.riga,
        acceleratore.website
      );
      continue;
    }

    run.inc("skippati");
    run.warn(
      "SKIP motivo=%s website=%s",
      esito.motivo || "sconosciuto",
      acceleratore.website
    );
  }

  run.alert("Scouting accelerators");
}

function getAcceleratorsSourceUrl_() {
  var prop = PropertiesService.getScriptProperties().getProperty("ACCELERATORS_SOURCE_URL");
  return prop
    ? String(prop).trim()
    : "https://rankings.ft.com/incubator-accelerator-programmes-europe";
}

function getAcceleratorsSourceOffset_() {
  var prop = PropertiesService.getScriptProperties().getProperty("ACCELERATORS_SOURCE_OFFSET");
  var n = prop ? parseInt(String(prop), 10) : 0;
  return isNaN(n) || n < 0 ? 0 : n;
}

function setAcceleratorsSourceOffset_(offset) {
  PropertiesService.getScriptProperties().setProperty(
    "ACCELERATORS_SOURCE_OFFSET",
    String(Math.max(0, offset || 0))
  );
}

function getAcceleratoriDaFTBatch_(opzioni) {
  var urlFonte = getAcceleratorsSourceUrl_();
  var batchSize = (opzioni && opzioni.batchSize) || 10;
  var run = creaRun_("accelerators_source");

  var offset = getAcceleratorsSourceOffset_();
  run.info("fetch fonte=%s offset=%s batch=%s", urlFonte, offset, batchSize);

  var ris = fetchHtml_(urlFonte);
  if (!ris.ok) {
    run.error("fetch fallito status=%s", ris.status || "?");
    return [];
  }

  // Guard rail: se non sembra FT ranking, fermati per evitare di inserire link spazzatura.
  if (!sembraPaginaRankingFT_(ris.html, urlFonte)) {
    run.error("pagina sorgente non riconosciuta come ranking FT (parsing bloccato)");
    return [];
  }

  var tutti = parseAcceleratoriDaFTHtml_(ris.html);
  run.info("righe parse=%s", tutti.length);
  if (!tutti.length) return [];

  var batch = tutti.slice(offset, offset + batchSize);
  setAcceleratorsSourceOffset_(offset + batchSize);

  // Dedup interna del batch e ritorno.
  var out = dedupListaRecordPerWebsite_(batch).filter(function (r) {
    return accettaWebsiteAcceleratore_(r && r.website);
  });
  run.info("batch=%s (dedup=%s) nuovo_offset=%s", batch.length, out.length, offset + batchSize);
  return out;
}

function parseAcceleratoriDaFTHtml_(html) {
  if (!html) return [];

  // Isola la sezione principale del ranking per evitare footer/nav.
  var sezione = estraiSezioneTra_(html, "150 hubs in this ranking", "## Useful links");
  if (!sezione) sezione = estraiSezioneTra_(html, "150 hubs in this ranking", "Useful links");
  if (!sezione) sezione = html;

  // Cerca la prima tabella dentro la sezione.
  var tabella = estraiPrimoTagBilanciato_(sezione, "table");
  if (!tabella) return [];

  var righe = estraiTagMultipli_(tabella, "tr");
  if (!righe.length) return [];

  // Header -> indici colonna
  var headerIdx = { name: -1, website: -1, country: -1 };
  var header = righe[0];
  var celleHeader = estraiCelleTabella_(header);
  for (var i = 0; i < celleHeader.length; i++) {
    var titolo = pulisciTestoSemplice_(celleHeader[i]).toLowerCase();
    if (titolo.indexOf("name") !== -1) headerIdx.name = i;
    if (titolo.indexOf("country") !== -1) headerIdx.country = i;
  }
  // Se non troviamo almeno "name" o "country" e' probabile che non sia la tabella giusta.
  if (headerIdx.name === -1 && headerIdx.country === -1) return [];

  var out = [];
  for (var r = 1; r < righe.length; r++) {
    var row = righe[r];
    var celle = estraiCelleTabella_(row);
    if (celle.length < 3) continue;

    var estratti = estraiNomeEWebsiteDaRigaFT_(row, celle, headerIdx.name);
    var nome = estratti.nome;
    var website = estratti.website;
    if (!website) continue;

    var country = "";
    if (headerIdx.country !== -1 && headerIdx.country < celle.length) {
      country = pulisciTestoSemplice_(celle[headerIdx.country]);
    } else {
      // Fallback: spesso la country e' dopo city, prova a prendere un token "country-like" verso fine.
      country = estraiCountryFallbackDaCelle_(celle);
    }

    out.push({ website: website, name: nome, country: country });
  }

  return out;
}

function estraiNomeEWebsiteDaRigaFT_(rowHtml, celle, idxName) {
  // 1) Cerca il primo anchor esterno nel rowHtml: di solito e' il sito del programma.
  var reA = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i;
  var m = rowHtml.match(reA);
  if (m) {
    var href = String(m[1] || "").trim();
    var testo = pulisciTestoSemplice_(m[2] || "");

    var website = normalizzaHrefWebsiteFT_(href);
    var nome = testo;
    if (!nome && idxName !== -1 && idxName < celle.length) nome = pulisciTestoSemplice_(celle[idxName]);
    return { nome: nome, website: website };
  }

  // 2) Fallback: prova a prendere da cella "name" (che puo' contenere un dominio visibile).
  var nome2 = idxName !== -1 && idxName < celle.length ? pulisciTestoSemplice_(celle[idxName]) : "";
  var dominio = estraiDominioDaTesto_(nome2);
  var website2 = dominio ? "https://" + dominio : "";
  return { nome: nome2, website: website2 };
}

function normalizzaHrefWebsiteFT_(href) {
  if (!href) return "";
  var h = String(href).trim();
  if (h.indexOf("//") === 0) h = "https:" + h;
  if (!/^https?:\/\//i.test(h)) {
    // Alcuni link potrebbero essere tipo "www.xxx.com"
    if (/^[a-z0-9.-]+\.[a-z]{2,}($|\/)/i.test(h)) h = "https://" + h;
  }
  var norm = normalizeWebsite(h);
  if (!norm) return "";
  // Evita link FT/help
  if (/^https?:\/\/(www\.)?ft\.com\b/i.test(norm)) return "";
  if (/^https?:\/\/help\.ft\.com\b/i.test(norm)) return "";
  if (/^https?:\/\/rankings\.ft\.com\b/i.test(norm)) return "";
  return norm;
}

function sembraPaginaRankingFT_(html, urlFonte) {
  if (!html) return false;
  var h = String(html);

  // Marker forti per riconoscere la pagina corretta.
  var okUrl = String(urlFonte || "").indexOf("rankings.ft.com/") !== -1;
  var hasFt = /financial times/i.test(h) || /rankings\.ft\.com/i.test(h);
  // Evita casi in cui per errore stiamo parsando F6S (per i tuoi sintomi).
  var looksLikeF6S = /f6s/i.test(h) && /terms of service|privacy policy/i.test(h);

  if (looksLikeF6S) return false;
  return okUrl && hasFt;
}

function accettaWebsiteAcceleratore_(website) {
  var w = normalizeWebsite(website);
  if (!w) return false;
  // Non accettiamo domini chiaramente non-acceleratori o pagine legali.
  if (/\/(privacy|terms|cookie)/i.test(w)) return false;
  if (/^https?:\/\/(www\.)?f6s\.com\b/i.test(w)) return false;
  if (/^https?:\/\/(www\.)?rankings\.ft\.com\b/i.test(w)) return false;
  if (/^https?:\/\/(www\.)?ft\.com\b/i.test(w)) return false;
  if (/^https?:\/\/support\.google\.com\b/i.test(w)) return false;
  if (/^https?:\/\/docs\.newrelic\.com\b/i.test(w)) return false;
  if (/^https?:\/\/sred\.f6s\.ca\b/i.test(w)) return false;
  return true;
}

function estraiCountryFallbackDaCelle_(celle) {
  // Heuristica: cerca una cella che sembra un paese (solo lettere/spazi) e non numerica.
  for (var i = celle.length - 1; i >= 0; i--) {
    var t = pulisciTestoSemplice_(celle[i]);
    if (!t) continue;
    if (/^\d/.test(t)) continue;
    if (t.length > 45) continue;
    if (/^[A-Za-z .'-]+$/.test(t) && t.split(" ").length <= 4) return t;
  }
  return "";
}

function estraiDominioDaTesto_(testo) {
  var t = String(testo || "");
  var m = t.match(/([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? String(m[1]).toLowerCase() : "";
}

function pulisciTestoSemplice_(s) {
  var t = String(s || "");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/gi, " ");
  t = t.replace(/&amp;/gi, "&");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function estraiDivPerId_(html, id) {
  if (!html || !id) return "";

  var idxId = html.indexOf('id="' + id + '"');
  if (idxId === -1) idxId = html.indexOf("id='" + id + "'");
  if (idxId === -1) return "";

  // Trova l'inizio del tag <div ...> che contiene l'id.
  var start = html.lastIndexOf("<div", idxId);
  if (start === -1) return "";

  // Conta i div fino alla chiusura corrispondente.
  var re = /<\/?div\b/gi;
  re.lastIndex = start;

  var profondita = 0;
  var first = true;
  var match;

  while ((match = re.exec(html))) {
    var token = match[0].toLowerCase(); // "<div" oppure "</div"
    if (token === "<div") {
      profondita++;
      first = false;
    } else if (token === "</div") {
      profondita--;
      if (!first && profondita === 0) {
        // include il tag di chiusura
        var end = html.indexOf(">", match.index);
        if (end === -1) end = re.lastIndex;
        return html.slice(start, end + 1);
      }
    }
  }

  return "";
}

function dedupListaRecordPerWebsite_(lista) {
  var out = [];
  var visti = new Set();
  for (var i = 0; i < (lista || []).length; i++) {
    var r = lista[i] || {};
    var chiave = normalizeWebsite(r.website);
    if (!chiave || visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(r);
  }
  return out;
}

function estraiSezioneTra_(html, startMarker, endMarker) {
  if (!html) return "";
  var s = html.indexOf(startMarker);
  if (s === -1) return "";
  var e = html.indexOf(endMarker, s);
  if (e === -1) return html.slice(s);
  return html.slice(s, e);
}

function estraiPrimoTagBilanciato_(html, tagName) {
  if (!html || !tagName) return "";
  var tag = String(tagName).toLowerCase();

  var re = new RegExp("<\\/?\\s*" + tag + "\\b", "gi");
  var first = html.search(new RegExp("<\\s*" + tag + "\\b", "i"));
  if (first === -1) return "";

  re.lastIndex = first;

  var depth = 0;
  var m;
  while ((m = re.exec(html))) {
    var token = m[0].toLowerCase();
    if (token.indexOf("</") === 0) {
      depth--;
      if (depth === 0) {
        var end = html.indexOf(">", m.index);
        if (end === -1) end = re.lastIndex;
        return html.slice(first, end + 1);
      }
    } else {
      depth++;
    }
  }
  return "";
}

function estraiTagMultipli_(html, tagName) {
  var out = [];
  if (!html || !tagName) return out;
  var re = new RegExp("<\\s*" + tagName + "\\b[^>]*>([\\s\\S]*?)<\\/\\s*" + tagName + "\\s*>", "gi");
  var m;
  while ((m = re.exec(html)) && out.length < 2000) {
    out.push(m[0]);
  }
  return out;
}

function estraiCelleTabella_(trHtml) {
  var celle = [];
  if (!trHtml) return celle;

  // Prende sia th che td in ordine.
  var re = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  var m;
  while ((m = re.exec(trHtml)) && celle.length < 50) {
    celle.push(m[2] || "");
  }
  return celle;
}
