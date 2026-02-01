function aggiornaStartupsDaAcceleratorsEuristico_(opzioni) {
  var maxAcceleratori = (opzioni && opzioni.maxAcceleratori) || 10;
  var maxStartupsPerAcceleratore =
    (opzioni && opzioni.maxStartupsPerAcceleratore) || 25;
  var maxNuoveStartupsTotali = (opzioni && opzioni.maxNuoveStartupsTotali) || 50;
  var maxVerificheSitiTotali = (opzioni && opzioni.maxVerificheSitiTotali) || 60;
  var maxVerificheSitiPerAcceleratore =
    (opzioni && opzioni.maxVerificheSitiPerAcceleratore) || 15;

  var run = creaRun_("startups");

  var contestoStartups = preparaContestoScheda_("startups");
  var acceleratori = leggiAcceleratoriDaScheda_();

  for (var i = 0; i < acceleratori.length; i++) {
    if ((run.contatori.processati || 0) >= maxAcceleratori) break;
    if ((run.contatori.inseriti || 0) >= maxNuoveStartupsTotali) break;

    var acc = acceleratori[i];
    var websiteAcc = acc.website;
    var chiaveAcc = normalizeWebsite(websiteAcc);
    if (!chiaveAcc) continue;

    run.inc("processati");
    run.info("acceleratore=%s", websiteAcc);

    var paginePortfolio = trovaPaginePortfolio_(websiteAcc);
    if (!paginePortfolio.length) {
      run.inc("skippati");
      run.warn("nessuna pagina portfolio trovata per=%s", websiteAcc);
      continue;
    }

    var viste = new Set();
    var verificheFatteQuestoAcceleratore = 0;

    for (var p = 0; p < paginePortfolio.length; p++) {
      if ((run.contatori.inseriti || 0) >= maxNuoveStartupsTotali) break;
      if (viste.size >= 2) break; // limita fetch per acceleratore

      var urlPortfolio = paginePortfolio[p];
      var chiavePortfolio = normalizeWebsite(urlPortfolio);
      if (!chiavePortfolio || viste.has(chiavePortfolio)) continue;
      viste.add(chiavePortfolio);

      var risposta = fetchHtml_(urlPortfolio);
      run.inc("pagine_portfolio_provate");

      if (!risposta.ok) {
        run.inc("errori");
        run.error(
          "errore fetch portfolio status=%s url=%s",
          risposta.status || "?",
          urlPortfolio
        );
        continue;
      }

      var link = estraiLinkDaHtml_(risposta.html, urlPortfolio);
      var candidati = estraiStartupDaLink_(link, dominioDaUrl_(websiteAcc));

      if (!candidati.length) {
        run.inc("skippati");
        run.warn("nessun candidato trovato in=%s", urlPortfolio);
        continue;
      }

      for (var s = 0; s < candidati.length; s++) {
        if ((run.contatori.inseriti || 0) >= maxNuoveStartupsTotali) break;
        if (s >= maxStartupsPerAcceleratore) break;
        if ((run.contatori.verifiche_siti_totali || 0) >= maxVerificheSitiTotali) break;
        if (verificheFatteQuestoAcceleratore >= maxVerificheSitiPerAcceleratore) break;

        var st = candidati[s];
        run.inc("startup_candidate");

        // 1) Dedup prima di fare fetch (evita richieste inutili).
        var chiaveStartup = normalizeWebsite(st.website);
        if (!chiaveStartup) {
          run.inc("skippati");
          run.warn("SKIP website non valida website=%s", st.website);
          continue;
        }
        if (contestoStartups.mappaWebsiteARiga.has(chiaveStartup)) {
          run.inc("duplicati");
          run.info("SKIP duplicato website=%s", st.website);
          continue;
        }

        // 2) Verifica sito: deve rispondere e avere contenuto minimo.
        verificheFatteQuestoAcceleratore++;
        run.inc("verifiche_siti_totali");
        var check = verificaSitoStartup_(st.website);
        if (!check.ok) {
          run.inc("skippati");
          run.warn("SKIP sito non valido motivo=%s website=%s", check.motivo, st.website);
          continue;
        }
        run.inc("verifiche_ok");

        var esito = appendIdempotente_(contestoStartups, {
          website: st.website,
          name: st.name,
          country: "", // non affidabile dedurlo dal portfolio
          accelerator: chiaveAcc,
          value_proposition: "",
        });

        if (esito.inserita) {
          run.inc("inseriti");
          run.info(
            "INSERITA riga=%s website=%s name=%s acc=%s",
            esito.riga,
            st.website,
            st.name,
            chiaveAcc
          );
        } else if (esito.motivo === "duplicato") {
          run.inc("duplicati");
          run.info("SKIP duplicato website=%s", st.website);
        } else {
          run.inc("errori");
          run.warn(
            "SKIP motivo=%s website=%s",
            esito.motivo || "sconosciuto",
            st.website
          );
        }
      }

      Utilities.sleep(200);
    }
  }

  run.alert("Aggiorna startups");
}

function leggiAcceleratoriDaScheda_() {
  var scheda = getScheda_("accelerators");
  var valori = leggiValori_(scheda);
  if (!valori || valori.length < 2) return [];

  var header = valori[0];
  var idxWebsite = trovaIndiceColonna_(header, "website");
  if (idxWebsite === -1) throw new Error("Colonna 'website' mancante in accelerators");

  var idxName = trovaIndiceColonna_(header, "name");
  var idxCountry = trovaIndiceColonna_(header, "country");

  var out = [];
  for (var r = 1; r < valori.length; r++) {
    var website = valori[r][idxWebsite];
    var chiave = normalizeWebsite(website);
    if (!chiave) continue;

    out.push({
      website: String(website || "").trim(),
      name: idxName !== -1 ? String(valori[r][idxName] || "").trim() : "",
      country: idxCountry !== -1 ? String(valori[r][idxCountry] || "").trim() : "",
    });
  }
  return out;
}

function trovaPaginePortfolio_(websiteAcceleratore) {
  var base = normalizeWebsite(websiteAcceleratore);
  if (!base) return [];

  // 1) Sitemap (se presente) e' spesso il modo piu' affidabile per trovare le pagine giuste.
  var daSitemap = trovaPaginePortfolioDaSitemap_(base);
  if (daSitemap.length) return daSitemap.slice(0, 5);

  var ris = fetchHtml_(base);
  if (!ris.ok) return fallbackPaginePortfolio_(base);

  var links = estraiLinkDaHtml_(ris.html, base);
  var candidate = selezionaLinkPortfolio_(links);

  if (candidate.length) return candidate.slice(0, 5);
  return fallbackPaginePortfolio_(base);
}

function trovaPaginePortfolioDaSitemap_(base) {
  var urlSitemap = base + "/sitemap.xml";
  var ris = fetchHtml_(urlSitemap);
  if (!ris.ok) return [];

  var html = ris.html || "";
  // Sitemap index -> segue 1-2 sitemap figlie
  if (/<sitemapindex\b/i.test(html)) {
    var locs = estraiLocDaSitemap_(html).slice(0, 2);
    var out = [];
    for (var i = 0; i < locs.length; i++) {
      var r = fetchHtml_(locs[i]);
      if (!r.ok) continue;
      out = out.concat(selezionaUrlPortfolioDaLista_(estraiLocDaSitemap_(r.html)));
      if (out.length >= 5) break;
    }
    return dedupUrl_(out).slice(0, 5);
  }

  return selezionaUrlPortfolioDaLista_(estraiLocDaSitemap_(html)).slice(0, 5);
}

function estraiLocDaSitemap_(xml) {
  var out = [];
  if (!xml) return out;
  var re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  var m;
  while ((m = re.exec(xml)) && out.length < 2000) {
    out.push(String(m[1] || "").trim());
  }
  return out;
}

function selezionaUrlPortfolioDaLista_(urls) {
  var keyword = /(portfolio|companies|company|startups|startup|alumni|batch|batches|cohort|class|ventures|programme|program)/i;
  var out = [];
  for (var i = 0; i < (urls || []).length; i++) {
    var u = String(urls[i] || "").trim();
    if (!u) continue;
    if (!/^https?:\/\//i.test(u)) continue;
    if (!keyword.test(u)) continue;
    out.push(u);
    if (out.length >= 20) break;
  }
  return dedupUrl_(out);
}

function dedupUrl_(urls) {
  var out = [];
  var visti = new Set();
  for (var i = 0; i < (urls || []).length; i++) {
    var chiave = normalizeWebsite(urls[i]);
    if (!chiave || visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(chiave);
  }
  return out;
}

function fallbackPaginePortfolio_(base) {
  var percorsi = [
    "/portfolio",
    "/companies",
    "/startups",
    "/alumni",
    "/batches",
    "/batch",
    "/program",
    "/programme",
    "/ventures",
  ];

  var out = [];
  for (var i = 0; i < percorsi.length; i++) {
    out.push(base + percorsi[i]);
  }
  return out;
}

function selezionaLinkPortfolio_(links) {
  var keyword = /(portfolio|companies|company|startups|startup|alumni|batch|batches|cohort|class|ventures|programme|program)/i;
  var visti = new Set();
  var scored = [];

  for (var i = 0; i < links.length; i++) {
    var u = links[i].url || "";
    var t = links[i].testo || "";
    var s = (u + " " + t).toLowerCase();
    if (!keyword.test(s)) continue;

    var chiave = normalizeWebsite(u);
    if (!chiave || visti.has(chiave)) continue;
    visti.add(chiave);

    var punti = 0;
    if (s.indexOf("portfolio") !== -1) punti += 4;
    if (s.indexOf("companies") !== -1 || s.indexOf("company") !== -1) punti += 3;
    if (s.indexOf("startups") !== -1 || s.indexOf("startup") !== -1) punti += 3;
    if (s.indexOf("alumni") !== -1) punti += 2;
    if (s.indexOf("batch") !== -1 || s.indexOf("batches") !== -1) punti += 2;
    if (s.indexOf("programme") !== -1 || s.indexOf("program") !== -1) punti += 1;

    scored.push({ url: u, punti: punti });
  }

  scored.sort(function (a, b) {
    return b.punti - a.punti;
  });

  return scored.map(function (x) {
    return x.url;
  });
}

function fetchHtml_(url) {
  var risultato = { ok: false, status: 0, html: "", errore: "" };
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      timeout: 10, // secondi
      headers: { "User-Agent": "Mozilla/5.0 (Apps Script; scouting)" },
    });

    var code = res.getResponseCode();
    risultato.status = code;
    if (code < 200 || code >= 300) {
      risultato.errore = "HTTP " + code;
      return risultato;
    }

    var html = res.getContentText() || "";
    // Limita per evitare di lavorare su HTML enormi.
    if (html.length > 250000) html = html.slice(0, 250000);

    risultato.ok = true;
    risultato.html = html;
    return risultato;
  } catch (e) {
    risultato.errore = e && e.message ? String(e.message) : String(e);
    Logger.log("[fetchHtml] errore url=%s err=%s", url, risultato.errore);
    return risultato;
  }
}

function estraiLinkDaHtml_(html, baseUrl) {
  var out = [];
  if (!html) return out;

  var re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  var max = 800; // evita loop su pagine enormi

  while ((match = re.exec(html)) && out.length < max) {
    var href = (match[1] || "").trim();
    if (!href) continue;

    var testo = pulisciTestoAnchor_(match[2] || "");
    var assoluto = unisciUrl_(baseUrl, href);
    if (!assoluto) continue;

    out.push({ url: assoluto, testo: testo });
  }

  return out;
}

function pulisciTestoAnchor_(testoHtml) {
  var s = String(testoHtml || "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function estraiStartupDaLink_(links, dominioAcceleratore) {
  var out = [];
  var visti = new Set();

  for (var i = 0; i < links.length; i++) {
    var url = links[i].url || "";
    var testo = links[i].testo || "";

    var chiave = normalizeWebsite(url);
    if (!chiave) continue;

    if (testo) {
      var t = String(testo).trim().toLowerCase();
      if (
        t === "apply" ||
        t === "more info" ||
        t === "learn more" ||
        t === "read more" ||
        t === "contact" ||
        t === "privacy policy" ||
        t === "terms" ||
        t === "cookie policy"
      ) {
        continue;
      }
    }

    var dominio = dominioDaUrl_(chiave);
    if (!dominio) continue;
    if (dominioAcceleratore && dominio === dominioAcceleratore) continue;
    if (eSocialOTracking_(chiave)) continue;
    if (eDominioNonStartup_(chiave)) continue;

    // Normalizza al dominio root (senza path) per evitare duplicati su /pricing ecc.
    var urlDominio = "https://" + dominio;
    var chiaveDominio = normalizeWebsite(urlDominio);
    if (!chiaveDominio || visti.has(chiaveDominio)) continue;
    visti.add(chiaveDominio);

    out.push({
      website: urlDominio,
      name: testo || dominio,
    });
  }

  return out;
}

function eSocialOTracking_(url) {
  return (
    /\/\/([^\/]+\.)?(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|t\.me|medium\.com|github\.com)\b/i.test(url) ||
    /\b(utm_|fbclid=|gclid=)/i.test(url)
  );
}

function eDominioNonStartup_(url) {
  // Blacklist per evitare di inserire link palesemente non-startup.
  return /\/\/([^\/]+\.)?(bing\.com|google\.com|goo\.gl|lnkd\.in|bit\.ly|t\.co|tinyurl\.com|share\.hsforms\.com|forms\.gle)\b/i.test(
    url
  );
}

function verificaSitoStartup_(website) {
  var base = normalizeWebsite(website);
  if (!base) return { ok: false, motivo: "website_non_valida" };

  var tentativi = [base, base + "/about", base + "/company"];

  for (var i = 0; i < tentativi.length; i++) {
    var url = tentativi[i];
    var ris = fetchHtml_(url);
    if (!ris.ok) {
      // DNS/SSL o HTTP non-2xx
      continue;
    }

    var testo = estraiTestoMinimoDaHtml_(ris.html);
    if (testo && testo.length >= 80) return { ok: true, motivo: "" };
  }

  // Se l'ultimo fetch aveva errore, prova a classificare (DNS/SSL/HTTP) per logging.
  var risFinale = fetchHtml_(base);
  if (!risFinale.ok) {
    if (risFinale.errore && /dns/i.test(risFinale.errore)) return { ok: false, motivo: "dns" };
    if (risFinale.errore && /ssl/i.test(risFinale.errore)) return { ok: false, motivo: "ssl" };
    if (risFinale.status) return { ok: false, motivo: "http_" + risFinale.status };
    return { ok: false, motivo: "fetch_ko" };
  }

  return { ok: false, motivo: "contenuto_vuoto" };
}

function estraiTestoMinimoDaHtml_(html) {
  if (!html) return "";

  var titolo = "";
  var descr = "";

  var mTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (mTitle) titolo = pulisciTestoAnchor_(mTitle[1] || "");

  var mDesc = html.match(
    /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i
  );
  if (mDesc) descr = pulisciTestoAnchor_(mDesc[1] || "");

  var blocchi = [];
  var re = /<(h1|h2|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  var match;
  while ((match = re.exec(html)) && blocchi.length < 10) {
    var t = pulisciTestoAnchor_(match[2] || "");
    if (t && t.length >= 20) blocchi.push(t);
  }

  var out = "";
  if (titolo) out += titolo + " ";
  if (descr) out += descr + " ";
  if (blocchi.length) out += blocchi.join(" ");

  out = out.replace(/\s+/g, " ").trim();
  if (out.length > 1200) out = out.slice(0, 1200);
  return out;
}

function unisciUrl_(baseUrl, href) {
  if (!href) return "";

  var h = String(href).trim();
  if (!h || h === "#") return "";
  if (/^(mailto:|tel:|javascript:)/i.test(h)) return "";

  if (/^https?:\/\//i.test(h)) return h;
  if (h.indexOf("//") === 0) return "https:" + h;

  var origine = origineDaUrl_(baseUrl);
  if (!origine) return "";

  if (h.indexOf("/") === 0) return origine + h;
  return origine + "/" + h;
}

function origineDaUrl_(url) {
  var u = normalizeWebsite(url);
  if (!u) return "";

  // u e' tipo https://host[/path]
  var m = u.match(/^(https?:\/\/[^\/]+)(\/.*)?$/i);
  return m ? m[1] : "";
}

function dominioDaUrl_(url) {
  var u = normalizeWebsite(url);
  if (!u) return "";
  var m = u.match(/^https?:\/\/([^\/]+)(\/.*)?$/i);
  if (!m) return "";
  var host = String(m[1] || "").toLowerCase();
  host = host.replace(/^www\./, "");
  // rimuove porta
  host = host.replace(/:\d+$/, "");
  return host;
}
