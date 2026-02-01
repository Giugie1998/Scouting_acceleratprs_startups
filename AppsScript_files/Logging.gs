// Logging minimale e coerente + contatori per riepilogo a fine run.

function creaRun_(tag) {
  var inizioMs = new Date().getTime();
  var contatori = {};

  function inc(chiave, delta) {
    var d = delta === undefined ? 1 : Number(delta);
    contatori[chiave] = (contatori[chiave] || 0) + d;
  }

  function fmt_(format) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!format) return "";
    try {
      return Utilities.formatString.apply(null, [format].concat(args));
    } catch (e) {
      // Fallback: se formatString fallisce, logga qualcosa di leggibile.
      return String(format) + (args.length ? " " + JSON.stringify(args) : "");
    }
  }

  function log_(livello, format) {
    var msg = fmt_.apply(null, Array.prototype.slice.call(arguments, 1));
    Logger.log("[%s] %s %s", tag, livello, msg);
  }

  function riepilogo(titolo) {
    var fineMs = new Date().getTime();
    var secondi = Math.round((fineMs - inizioMs) / 1000);

    var righe = [];
    righe.push((titolo || tag) + " completato.");
    righe.push("Durata: " + secondi + "s");

    // Ordine "standard" per scansione veloce
    var ordine = [
      "processati",
      "inseriti",
      "generate",
      "duplicati",
      "skippati",
      "errori",
    ];

    for (var i = 0; i < ordine.length; i++) {
      var k = ordine[i];
      if (contatori[k] !== undefined) righe.push(k + ": " + contatori[k]);
    }

    // Eventuali contatori extra
    var extra = Object.keys(contatori).filter(function (k) {
      return ordine.indexOf(k) === -1;
    });
    extra.sort();
    for (var j = 0; j < extra.length; j++) {
      righe.push(extra[j] + ": " + contatori[extra[j]]);
    }

    return righe.join("\n");
  }

  function alert(titolo) {
    SpreadsheetApp.getUi().alert(riepilogo(titolo));
  }

  return {
    tag: tag,
    inc: inc,
    info: function (format) {
      log_.apply(null, ["INFO"].concat(Array.prototype.slice.call(arguments)));
    },
    warn: function (format) {
      log_.apply(null, ["WARN"].concat(Array.prototype.slice.call(arguments)));
    },
    error: function (format) {
      log_.apply(null, ["ERROR"].concat(Array.prototype.slice.call(arguments)));
    },
    riepilogo: riepilogo,
    alert: alert,
    contatori: contatori,
  };
}

