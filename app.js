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
  var clearHolidaysBtn = document.getElementById("clear-holidays");
  var clearLocksBtn = document.getElementById("clear-locks");
  var copyStatus = document.getElementById("copy-status");
  var liveStatus = document.getElementById("live-status");

  var currentPlan = null;
  var currentSeed = 0;
  var shirtNameValues = [];
  var pantNameValues = [];
  var holidays = [];
  var locks = [];

  function toInt(value) {
    var n = Number(value);
    return Number.isInteger(n) ? n : NaN;
  }

  function normalizeHolidayMarks(list) {
    var out = [];
    var seen = {};
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var raw = list[i] || {};
      var week = raw.week;
      var day = raw.day;
      if (!Number.isInteger(week) || !Number.isInteger(day)) continue;
      var key = week + ":" + day;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ week: week, day: day });
    }
    return out;
  }

  function holidayIndex(week, day) {
    for (var i = 0; i < holidays.length; i++) {
      if (holidays[i].week === week && holidays[i].day === day) return i;
    }
    return -1;
  }

  function normalizeLockMarks(list) {
    var out = [];
    var seen = {};
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var raw = list[i] || {};
      if (!Number.isInteger(raw.week) || !Number.isInteger(raw.day)) continue;
      if (!Number.isInteger(raw.shirt) || !Number.isInteger(raw.pant)) continue;
      var key = raw.week + ":" + raw.day;
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ week: raw.week, day: raw.day, shirt: raw.shirt, pant: raw.pant });
    }
    return out;
  }

  function pruneLocksForWardrobe(shirts, pants) {
    if (!Number.isInteger(shirts) || !Number.isInteger(pants)) return;
    var next = [];
    for (var i = 0; i < locks.length; i++) {
      var lock = locks[i];
      if (lock.shirt >= 0 && lock.shirt < shirts && lock.pant >= 0 && lock.pant < pants) {
        next.push(lock);
      }
    }
    locks = next;
  }

  function lockIndex(week, day) {
    for (var i = 0; i < locks.length; i++) {
      if (locks[i].week === week && locks[i].day === day) return i;
    }
    return -1;
  }

  function removeLock(week, day) {
    var idx = lockIndex(week, day);
    if (idx >= 0) locks.splice(idx, 1);
    return idx >= 0;
  }

  function setLock(week, day, shirt, pant) {
    removeLock(week, day);
    locks.push({ week: week, day: day, shirt: shirt, pant: pant });
  }

  function slotFromPlan(week, day) {
    if (!currentPlan || !currentPlan.slots) return null;
    for (var i = 0; i < currentPlan.slots.length; i++) {
      if (currentPlan.slots[i].week === week && currentPlan.slots[i].day === day) {
        return currentPlan.slots[i];
      }
    }
    return null;
  }

  function focusSlotControl(week, day, selector) {
    var sel = '.slot[data-week="' + week + '"][data-day="' + day + '"] ' + selector;
    var buttons = document.querySelectorAll(sel);
    for (var b = 0; b < buttons.length; b++) {
      if (buttons[b].offsetParent !== null) {
        buttons[b].focus();
        return;
      }
    }
  }

  var LOCK_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 1.5A2.5 2.5 0 005.5 4v2h-1A1.5 1.5 0 003 7.5v6A1.5 1.5 0 004.5 15h7a1.5 1.5 0 001.5-1.5v-6A1.5 1.5 0 0011.5 6h-1V4A2.5 2.5 0 008 1.5zm-1 2.5A1 1 0 018 3a1 1 0 011 1v2H7V4z"/></svg>';

  function toggleHoliday(week, day) {
    var idx = holidayIndex(week, day);
    if (idx >= 0) {
      holidays.splice(idx, 1);
    } else {
      holidays.push({ week: week, day: day });
      removeLock(week, day);
    }
    makePlan(
      currentSeed,
      idx >= 0 ? "Holiday removed. Plan recalculated." : "Holiday marked. Plan recalculated."
    );
    focusSlotControl(week, day, ".holiday-toggle");
  }

  function shuffleDay(week, day) {
    var slot = slotFromPlan(week, day);
    if (!slot || slot.holiday) return;
    var options = readInputs();
    var next = Somo.cycleDayPair(options, week, day, slot.shirt, slot.pant);
    if (!next.changed) {
      liveStatus.textContent = "This day has no other combination.";
      focusSlotControl(week, day, ".day-shuffle");
      return;
    }
    setLock(week, day, next.shirt, next.pant);
    var combo = Somo.comboLabel(
      options.shirtNames && options.shirtNames[next.shirt] ? String(options.shirtNames[next.shirt]).trim() || Somo.defaultShirtName(next.shirt) : Somo.defaultShirtName(next.shirt),
      options.pantNames && options.pantNames[next.pant] ? String(options.pantNames[next.pant]).trim() || Somo.defaultPantName(next.pant) : Somo.defaultPantName(next.pant)
    );
    // Use the plan's normalize via a temporary message; makePlan will apply names properly.
    makePlan(currentSeed, "This day is locked to a new outfit. The rest of the plan was recalculated.");
    var updated = slotFromPlan(week, day);
    if (updated && updated.combo) {
      liveStatus.textContent = "This day is locked to " + updated.combo + ". The rest of the plan was recalculated.";
    }
    focusSlotControl(week, day, ".day-shuffle");
  }

  function unlockDay(week, day) {
    if (!removeLock(week, day)) return;
    makePlan(currentSeed, "Day unlocked. Plan recalculated.");
    focusSlotControl(week, day, ".holiday-toggle");
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
      holidays: holidays.slice(),
      locks: locks.slice(),
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
      holidays = normalizeHolidayMarks(data.holidays);
      locks = normalizeLockMarks(data.locks);
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

  function fillSlotCell(cell, withDayName) {
    var ref = Somo.slotRef(cell.week, cell.dayName);
    var wrap = document.createElement("div");
    wrap.className = "slot" + (cell.holiday ? " holiday" : "") + (cell.locked ? " locked" : "");
    wrap.setAttribute("data-week", String(cell.week));
    wrap.setAttribute("data-day", String(cell.day));

    if (withDayName) {
      var day = document.createElement("span");
      day.className = "card-day";
      day.textContent = cell.dayName;
      wrap.appendChild(day);
    }

    var body = document.createElement("div");
    body.className = withDayName ? "slot-body card-outfit" : "slot-body";
    if (cell.holiday) {
      var label = document.createElement("span");
      label.className = "holiday-label";
      label.textContent = "Holiday";
      body.appendChild(label);
    } else {
      var combo = document.createElement("span");
      combo.className = "combo";
      combo.textContent = cell.combo;
      body.appendChild(combo);
      if (cell.repeatLabel) {
        var rep = document.createElement("span");
        rep.className = "repeat-of";
        rep.textContent = cell.repeatLabel;
        body.appendChild(rep);
      }
    }
    wrap.appendChild(body);

    if (cell.locked) {
      var lockBtn = document.createElement("button");
      lockBtn.type = "button";
      lockBtn.className = "lock-btn";
      lockBtn.setAttribute("aria-label", ref + " is locked to " + cell.combo + ". Click to unlock.");
      lockBtn.title = "Unlock this day";
      lockBtn.innerHTML = LOCK_SVG;
      wrap.appendChild(lockBtn);
    }

    var tools = document.createElement("div");
    tools.className = "slot-tools";
    var holBtn = document.createElement("button");
    holBtn.type = "button";
    holBtn.className = "holiday-toggle";
    holBtn.setAttribute("aria-pressed", cell.holiday ? "true" : "false");
    holBtn.textContent = cell.holiday ? "Unmark holiday" : "Mark holiday";
    holBtn.setAttribute(
      "aria-label",
      cell.holiday ? "Unmark the holiday on " + ref + "." : "Mark " + ref + " as a holiday."
    );
    tools.appendChild(holBtn);
    if (!cell.holiday) {
      var shuf = document.createElement("button");
      shuf.type = "button";
      shuf.className = "day-shuffle";
      shuf.textContent = "Shuffle";
      shuf.setAttribute("aria-label", "Shuffle " + ref + " to a different outfit and lock it.");
      tools.appendChild(shuf);
    }
    wrap.appendChild(tools);
    return wrap;
  }

  function renderTimetable(plan) {
    timetableWrap.replaceChildren();
    var rows = Somo.timetableRows(plan);

    var table = document.createElement("table");
    table.className = "timetable desktop-table";
    var cap = document.createElement("caption");
    cap.className = "sr-only";
    cap.textContent = "Outfit timetable by week and day. Use Mark holiday to mark a day off, or Shuffle to lock a different outfit on that day.";
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
        if (cell.holiday) td.className = "is-holiday";
        if (cell.locked) td.className = (td.className ? td.className + " " : "") + "is-locked";
        td.appendChild(fillSlotCell(cell, false));
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
        li.appendChild(fillSlotCell(item, true));
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
    var workWord = plan.workingDays === 1 ? "working day" : "working days";
    var dayWord = plan.holidayCount ? workWord : plan.workingDays === 1 ? "day" : "days";
    var repeatWord = plan.repeatDays === 1 ? "is" : "are";
    repeatEl.replaceChildren();
    var p1 = document.createElement("p");
    var cover =
      plan.unique +
      " " +
      uniqueWord +
      " available (" +
      plan.shirts +
      " × " +
      plan.pants +
      "). ";
    if (plan.holidayCount) {
      cover +=
        "The plan covers " +
        plan.workingDays +
        " " +
        workWord +
        " and " +
        plan.holidayCount +
        " " +
        (plan.holidayCount === 1 ? "holiday" : "holidays") +
        ".";
    } else {
      cover += "The plan covers " + plan.workingDays + " " + dayWord + ".";
    }
    if (plan.lockCount) {
      cover +=
        " " +
        plan.lockCount +
        (plan.lockCount === 1 ? " day is" : " days are") +
        " locked.";
    }
    p1.textContent = cover;
    var p2 = document.createElement("p");
    p2.textContent =
      plan.workingDays === 0
        ? "There are no working days left to assign outfits."
        : plan.repeatDays === 0
          ? "None of the days repeat a pair from an earlier day."
          : plan.repeatDays +
            " of the " +
            plan.workingDays +
            " " +
            dayWord +
            " " +
            repeatWord +
            " a repeat of a pair worn on a previous day.";
    repeatEl.appendChild(p1);
    repeatEl.appendChild(p2);
    if (plan.repeats && plan.repeats.length) {
      var heading = document.createElement("h3");
      heading.textContent = "Repeat list";
      var list = document.createElement("ul");
      list.className = "repeat-list";
      for (var r = 0; r < plan.repeats.length; r++) {
        var item = plan.repeats[r];
        var li = document.createElement("li");
        li.textContent = item.label + ": " + item.combo + " — Repeat of " + item.repeatOf;
        list.appendChild(li);
      }
      repeatEl.appendChild(heading);
      repeatEl.appendChild(list);
    }
    if (plan.ignoredHolidays && plan.ignoredHolidays.length) {
      var note = document.createElement("p");
      note.className = "ignored-note";
      var n = plan.ignoredHolidays.length;
      note.textContent =
        n === 1
          ? "1 holiday mark is outside the current period or is not a work day, so it was ignored."
          : n + " holiday marks are outside the current period or are not work days, so they were ignored.";
      repeatEl.appendChild(note);
    }
    if (plan.ignoredLocks && plan.ignoredLocks.length) {
      var lockNote = document.createElement("p");
      lockNote.className = "ignored-note";
      var ln = plan.ignoredLocks.length;
      lockNote.textContent =
        ln === 1
          ? "1 lock was ignored because that day is a holiday, is outside the current period, or no longer matches the wardrobe."
          : ln + " locks were ignored because those days are holidays, are outside the current period, or no longer match the wardrobe.";
      repeatEl.appendChild(lockNote);
    }

    results.hidden = false;
    shuffleBtn.disabled = plan.workingDays < 1;
    if (clearHolidaysBtn) clearHolidaysBtn.hidden = holidays.length === 0;
    if (clearLocksBtn) clearLocksBtn.hidden = locks.length === 0;
    liveStatus.textContent = message || plan.summary;
  }

  function makePlan(seed, message) {
    var options = readInputs();
    options.seed = seed;
    pruneLocksForWardrobe(options.shirts, options.pants);
    options.locks = locks.slice();
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
    if (currentPlan && currentPlan.lockCount && currentPlan.lockCount >= currentPlan.workingDays && currentPlan.workingDays > 0) {
      liveStatus.textContent = "Every working day is locked, so the plan cannot be shuffled. Unlock a day first.";
      return;
    }
    var seed = Somo.findShuffledSeed(options, signatureDays, startFrom, 48);
    var message = locks.length
      ? "Shuffled the unlocked days. Locked days were kept."
      : "Shuffled to a different plan of the same quality.";
    var plan = makePlan(seed, message);
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

  function slotCoords(el) {
    var root = el.closest ? el.closest(".slot") : null;
    if (!root) return null;
    var week = Number(root.getAttribute("data-week"));
    var day = Number(root.getAttribute("data-day"));
    if (!Number.isInteger(week) || !Number.isInteger(day)) return null;
    return { week: week, day: day };
  }

  timetableWrap.addEventListener("click", function (event) {
    var target = event.target;
    if (!target.closest) return;
    var shuffleEl = target.closest(".day-shuffle");
    if (shuffleEl && timetableWrap.contains(shuffleEl)) {
      event.preventDefault();
      var shufAt = slotCoords(shuffleEl);
      if (shufAt) shuffleDay(shufAt.week, shufAt.day);
      return;
    }
    var lockEl = target.closest(".lock-btn");
    if (lockEl && timetableWrap.contains(lockEl)) {
      event.preventDefault();
      var lockAt = slotCoords(lockEl);
      if (lockAt) unlockDay(lockAt.week, lockAt.day);
      return;
    }
    var holEl = target.closest(".holiday-toggle");
    if (holEl && timetableWrap.contains(holEl)) {
      var holAt = slotCoords(holEl);
      if (holAt) toggleHoliday(holAt.week, holAt.day);
    }
  });

  if (clearHolidaysBtn) {
    clearHolidaysBtn.addEventListener("click", function () {
      if (!holidays.length) return;
      holidays = [];
      makePlan(currentSeed, "Holidays cleared. Plan recalculated.");
    });
  }

  if (clearLocksBtn) {
    clearLocksBtn.addEventListener("click", function () {
      if (!locks.length) return;
      locks = [];
      makePlan(currentSeed, "Locks cleared. Plan recalculated.");
    });
  }

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
