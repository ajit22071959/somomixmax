(function () {
  "use strict";

  var STORAGE_KEY = "somomixmax.settings.v1";
  var Somo = window.Somomixmax;
  if (!Somo) return;

  var form = document.getElementById("planner-form");
  var shirtsInput = document.getElementById("shirts");
  var pantsInput = document.getElementById("pants");
  var weeksInput = document.getElementById("weeks");
  var daysInput = document.getElementById("daysPerWeek");
  var dayHint = document.getElementById("day-hint");
  var shirtNamesBox = document.getElementById("shirt-names");
  var pantNamesBox = document.getElementById("pant-names");
  var errorBox = document.getElementById("form-errors");
  var results = document.getElementById("results");
  var summaryEl = document.getElementById("summary");
  var timetableWrap = document.getElementById("timetable-wrap");
  var shirtWearEl = document.getElementById("shirt-wear");
  var pantWearEl = document.getElementById("pant-wear");
  var repeatEl = document.getElementById("repeat-stats");
  var shuffleBtn = document.getElementById("shuffle");
  var copyBtn = document.getElementById("copy-plan");
  var csvBtn = document.getElementById("download-csv");
  var printBtn = document.getElementById("print-plan");
  var copyStatus = document.getElementById("copy-status");
  var liveStatus = document.getElementById("live-status");

  var currentPlan = null;
  var currentSeed = 0;
  var shirtNameValues = [];
  var pantNameValues = [];

  function toInt(value) {
    var n = Number(value);
    return Number.isInteger(n) ? n : NaN;
  }

  function readInputs() {
    return {
      shirts: toInt(shirtsInput.value),
      pants: toInt(pantsInput.value),
      weeks: toInt(weeksInput.value),
      daysPerWeek: toInt(daysInput.value),
      shirtNames: collectNames(shirtNamesBox, shirtNameValues),
      pantNames: collectNames(pantNamesBox, pantNameValues),
      seed: currentSeed,
    };
  }

  function collectNames(container, cache) {
    var fields = container.querySelectorAll("input");
    var values = [];
    for (var i = 0; i < fields.length; i++) {
      values[i] = fields[i].value;
      cache[i] = fields[i].value;
    }
    return values;
  }

  function dayRangeLabel(days) {
    if (!Number.isInteger(days) || days < 1) days = 5;
    if (days > 7) days = 7;
    var names = Somo.DAY_NAMES.slice(0, days);
    if (names.length === 1) return "Day names: " + names[0] + " only.";
    return "Day names: " + names[0] + "–" + names[names.length - 1] + ".";
  }

  function renderNameFields(container, count, cache, kind, fallback) {
    if (!Number.isInteger(count) || count < 1) count = 1;
    if (count > Somo.LIMITS.maxItems) count = Somo.LIMITS.maxItems;
    var existing = [];
    var fields = container.querySelectorAll("input");
    for (var i = 0; i < fields.length; i++) {
      existing[i] = fields[i].value;
      cache[i] = fields[i].value;
    }
    container.replaceChildren();
    for (var n = 0; n < count; n++) {
      var id = kind + "-name-" + n;
      var label = document.createElement("label");
      label.setAttribute("for", id);
      var caption = document.createElement("span");
      caption.textContent = fallback(n);
      var input = document.createElement("input");
      input.type = "text";
      input.id = id;
      input.name = id;
      input.maxLength = 40;
      input.autocomplete = "off";
      input.placeholder = fallback(n);
      var value = existing[n] != null ? existing[n] : cache[n];
      if (value) input.value = value;
      label.appendChild(caption);
      label.appendChild(input);
      container.appendChild(label);
    }
  }

  function syncNameFields() {
    renderNameFields(
      shirtNamesBox,
      toInt(shirtsInput.value),
      shirtNameValues,
      "shirt",
      Somo.defaultShirtName
    );
    renderNameFields(
      pantNamesBox,
      toInt(pantsInput.value),
      pantNameValues,
      "pant",
      Somo.defaultPantName
    );
    dayHint.textContent = dayRangeLabel(toInt(daysInput.value));
  }

  function showErrors(errors) {
    errorBox.replaceChildren();
    if (!errors || !errors.length) {
      errorBox.hidden = true;
      return;
    }
    var list = document.createElement("ul");
    for (var i = 0; i < errors.length; i++) {
      var li = document.createElement("li");
      li.textContent = errors[i];
      list.appendChild(li);
    }
    errorBox.appendChild(list);
    errorBox.hidden = false;
  }

  function saveSettings() {
    var data = readInputs();
    data.seed = currentSeed;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      // Private mode can block storage; the plan still works for this visit.
    }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return false;
      if (data.shirts) shirtsInput.value = data.shirts;
      if (data.pants) pantsInput.value = data.pants;
      if (data.weeks) weeksInput.value = data.weeks;
      if (data.daysPerWeek) daysInput.value = data.daysPerWeek;
      shirtNameValues = Array.isArray(data.shirtNames) ? data.shirtNames.slice() : [];
      pantNameValues = Array.isArray(data.pantNames) ? data.pantNames.slice() : [];
      currentSeed = Number.isInteger(data.seed) && data.seed >= 0 ? data.seed : 0;
      return true;
    } catch (err) {
      return false;
    }
  }

  function renderWearList(target, names, counts, singular) {
    target.replaceChildren();
    var table = document.createElement("table");
    table.className = "wear-table";
    var caption = document.createElement("caption");
    caption.className = "sr-only";
    caption.textContent = "Times each " + singular + " is worn";
    table.appendChild(caption);
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th scope=\"col\">" + capitalize(singular) + "</th><th scope=\"col\">Times worn</th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");
    for (var i = 0; i < names.length; i++) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = names[i];
      var td = document.createElement("td");
      td.textContent = String(counts[i]);
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    target.appendChild(table);
  }

  function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function renderTimetable(plan) {
    timetableWrap.replaceChildren();
    var rows = Somo.timetableRows(plan);

    var table = document.createElement("table");
    table.className = "timetable desktop-table";
    var cap = document.createElement("caption");
    cap.className = "sr-only";
    cap.textContent = "Outfit timetable by week and day";
    table.appendChild(cap);

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    var weekHead = document.createElement("th");
    weekHead.scope = "col";
    weekHead.textContent = "Week";
    headRow.appendChild(weekHead);
    for (var d = 0; d < plan.daysPerWeek; d++) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = plan.dayNames[d];
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    for (var i = 0; i < rows.length; i++) {
      var tr = document.createElement("tr");
      var weekCell = document.createElement("th");
      weekCell.scope = "row";
      weekCell.textContent = String(rows[i].week);
      tr.appendChild(weekCell);
      for (var j = 0; j < rows[i].cells.length; j++) {
        var cell = rows[i].cells[j];
        var td = document.createElement("td");
        td.setAttribute("data-day", cell.dayName);
        var shirt = document.createElement("span");
        shirt.className = "piece shirt";
        shirt.textContent = cell.shirtName;
        var pant = document.createElement("span");
        pant.className = "piece pant";
        pant.textContent = cell.pantName;
        td.appendChild(shirt);
        td.appendChild(pant);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    timetableWrap.appendChild(table);

    var cards = document.createElement("div");
    cards.className = "week-cards";
    for (var w = 0; w < rows.length; w++) {
      var section = document.createElement("section");
      section.className = "week-card";
      var heading = document.createElement("h3");
      heading.textContent = "Week " + rows[w].week;
      section.appendChild(heading);
      var list = document.createElement("ol");
      for (var c = 0; c < rows[w].cells.length; c++) {
        var item = rows[w].cells[c];
        var li = document.createElement("li");
        var day = document.createElement("span");
        day.className = "card-day";
        day.textContent = item.dayName;
        var outfit = document.createElement("span");
        outfit.className = "card-outfit";
        outfit.innerHTML =
          "<span class=\"piece shirt\"></span><span class=\"piece pant\"></span>";
        outfit.querySelector(".shirt").textContent = item.shirtName;
        outfit.querySelector(".pant").textContent = item.pantName;
        li.appendChild(day);
        li.appendChild(outfit);
        list.appendChild(li);
      }
      section.appendChild(list);
      cards.appendChild(section);
    }
    timetableWrap.appendChild(cards);
  }

  function renderPlan(plan, message) {
    currentPlan = plan;
    summaryEl.textContent = plan.summary;
    renderTimetable(plan);
    renderWearList(shirtWearEl, plan.shirtNames, plan.shirtWear, "shirt");
    renderWearList(pantWearEl, plan.pantNames, plan.pantWear, "pant");

    var uniqueWord = plan.unique === 1 ? "unique outfit" : "unique outfits";
    var dayWord = plan.totalDays === 1 ? "day" : "days";
    var repeatWord = plan.repeatDays === 1 ? "day is" : "days are";
    repeatEl.replaceChildren();
    var p1 = document.createElement("p");
    p1.textContent =
      plan.unique +
      " " +
      uniqueWord +
      " available (" +
      plan.shirts +
      " × " +
      plan.pants +
      "). The plan covers " +
      plan.totalDays +
      " " +
      dayWord +
      ".";
    var p2 = document.createElement("p");
    p2.textContent =
      plan.repeatDays === 0
        ? "None of the days repeat a pair from an earlier day."
        : plan.repeatDays +
          " of the " +
          plan.totalDays +
          " " +
          dayWord +
          " " +
          repeatWord +
          " a repeat of a pair worn on a previous day.";
    repeatEl.appendChild(p1);
    repeatEl.appendChild(p2);

    results.hidden = false;
    shuffleBtn.disabled = false;
    liveStatus.textContent = message || plan.summary;
  }

  function makePlan(seed, message) {
    var options = readInputs();
    options.seed = seed;
    var errors = Somo.validateInputs(options);
    showErrors(errors);
    if (errors.length) {
      results.hidden = true;
      shuffleBtn.disabled = true;
      currentPlan = null;
      liveStatus.textContent = errors[0];
      errorBox.focus();
      return null;
    }
    var plan = Somo.generateSchedule(options);
    currentSeed = plan.seed;
    saveSettings();
    renderPlan(plan, message);
    return plan;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    currentSeed = 0;
    var plan = makePlan(0, "Default plan ready.");
    if (plan) results.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  shuffleBtn.addEventListener("click", function () {
    var options = readInputs();
    var errors = Somo.validateInputs(options);
    showErrors(errors);
    if (errors.length) {
      shuffleBtn.disabled = true;
      return;
    }
    var startFrom = currentSeed + 1;
    var signatureDays = currentPlan ? currentPlan.days : [];
    var seed = Somo.findShuffledSeed(options, signatureDays, startFrom, 48);
    var plan = makePlan(seed, "Shuffled to a different plan of the same quality.");
    if (plan && currentPlan && Somo.daySignature(plan.days) === Somo.daySignature(signatureDays) && signatureDays.length) {
      liveStatus.textContent = "This wardrobe only has one arrangement of this quality.";
    }
  });

  function flashCopy(text) {
    copyStatus.textContent = text;
    window.setTimeout(function () {
      if (copyStatus.textContent === text) copyStatus.textContent = "";
    }, 2500);
  }

  copyBtn.addEventListener("click", function () {
    if (!currentPlan) return;
    var text = Somo.toPlainText(currentPlan);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          flashCopy("Plan copied.");
        },
        function () {
          fallbackCopy(text);
        }
      );
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      flashCopy("Plan copied.");
    } catch (err) {
      flashCopy("Copy failed. You can select the timetable and copy it yourself.");
    }
    document.body.removeChild(area);
  }

  csvBtn.addEventListener("click", function () {
    if (!currentPlan) return;
    var blob = new Blob([Somo.toCsv(currentPlan)], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "somomixmax-plan.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    flashCopy("CSV downloaded.");
  });

  printBtn.addEventListener("click", function () {
    window.print();
  });

  shirtsInput.addEventListener("input", syncNameFields);
  pantsInput.addEventListener("input", syncNameFields);
  daysInput.addEventListener("input", function () {
    dayHint.textContent = dayRangeLabel(toInt(daysInput.value));
  });

  var hadSettings = loadSettings();
  syncNameFields();
  if (hadSettings) {
    makePlan(currentSeed, "Restored your last plan.");
  }
})();
