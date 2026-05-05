const DATA_SOURCE = "data/applications.csv";
const TIMELINE_EDGE_PADDING_PERCENT = 7;

/*
  Update this mapping section if the spreadsheet column names change.
  The app will use the first matching header it finds for each field.
*/
const COLUMN_CANDIDATES = {
  university: ["Uni", "University"],
  course: ["Program", "Course"],
  applicationDeadline: ["Application Deadline", "Deadline"],
  courseStartDate: [
    "Course Start Date",
    "Course Start",
    "Intake",
    "Course start date / intake"
  ],
  duration: ["Course Duration", "Duration"],
  acsAccredited: ["ACS Accredited", "ACS accreditation status"],
  preference: ["Preference", "Preference Rank", "Priority"],
  appliedStatus: [
    "Application Status",
    "Applied Status",
    "Application status / whether I have applied",
    "Applied"
  ],
  courseOutlineLink: [
    "Course Outline Link",
    "Course outline link",
    "Course Outline",
    "Official course outline link"
  ],
  notes: ["Notes", "Requirements", "Notes / requirements"],
  cricos: ["CRICOS"],
  postStudyVisaDuration: ["Post Study Visa Duration"],
  semesters: ["Semesters"],

  // Future fields to support admissions and visa tracking later.
  visaRequired: ["Visa application required?"],
  visaChecklist: ["Visa document checklist"],
  visaStatus: ["Visa application status"],
  visaDeadline: ["Visa deadline"],
  coeReceived: ["CoE received?"],
  oshcStatus: ["OSHC status"],
  depositPaid: ["Deposit paid?"],
  offerReceived: ["Offer received?"],
  acceptanceDeadline: ["Acceptance deadline"]
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short"
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  month: "short"
});

const state = {
  applications: [],
  filteredApplications: [],
  columnMapping: {},
  filters: {
    search: "",
    applied: "all",
    acs: "all",
    sort: "deadline-asc"
  }
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  elements.pageStatus = document.querySelector("#pageStatus");
  elements.overviewCards = document.querySelector("#overviewCards");
  elements.needsAttention = document.querySelector("#needsAttention");
  elements.tableBody = document.querySelector("#applicationsTableBody");
  elements.timeline = document.querySelector("#timeline");
  elements.searchInput = document.querySelector("#searchInput");
  elements.appliedFilter = document.querySelector("#appliedFilter");
  elements.acsFilter = document.querySelector("#acsFilter");
  elements.sortOrder = document.querySelector("#sortOrder");

  bindEvents();
  loadApplications();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderAll();
  });

  elements.appliedFilter.addEventListener("change", (event) => {
    state.filters.applied = event.target.value;
    renderAll();
  });

  elements.acsFilter.addEventListener("change", (event) => {
    state.filters.acs = event.target.value;
    renderAll();
  });

  elements.sortOrder.addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    renderAll();
  });

  elements.tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-details-button]");

    if (!button) {
      return;
    }

    const rowId = button.getAttribute("data-row-id");
    const detailsRow = document.querySelector(`[data-details-row="${rowId}"]`);
    const isOpen = button.getAttribute("aria-expanded") === "true";

    button.setAttribute("aria-expanded", String(!isOpen));
    button.textContent = isOpen ? "Details" : "Hide details";
    detailsRow.hidden = isOpen;
  });
}

async function loadApplications() {
  try {
    setStatus("Loading applications from CSV...");

    const response = await fetch(DATA_SOURCE, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Could not load ${DATA_SOURCE} (${response.status})`);
    }

    const csvText = await response.text();
    const { headers, rows } = parseCsv(csvText);

    if (!headers.length) {
      throw new Error("The CSV file is empty.");
    }

    state.columnMapping = resolveColumnMapping(headers);

    const missingRequiredColumns = getMissingColumns(state.columnMapping, [
      "university",
      "course"
    ]);

    if (missingRequiredColumns.length > 0) {
      throw new Error(
        `The CSV is missing required columns: ${missingRequiredColumns.join(", ")}.`
      );
    }

    state.applications = rows.map((row, index) => buildApplication(row, index));

    renderAll();

    const missingOptionalColumns = getMissingColumns(state.columnMapping, [
      "applicationDeadline",
      "courseStartDate",
      "duration",
      "acsAccredited",
      "appliedStatus",
      "courseOutlineLink",
      "notes"
    ]);

    if (missingOptionalColumns.length > 0) {
      setStatus(
        `Loaded ${state.applications.length} courses. Reference date: ${formatDateLabel(
          getStartOfToday()
        )}. Missing optional columns: ${missingOptionalColumns.join(", ")}.`
      );
      return;
    }

    setStatus(
      `Loaded ${state.applications.length} courses from CSV. Reference date: ${formatDateLabel(
        getStartOfToday()
      )}.`
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message, true);
    renderErrorState(error.message);
  }
}

function setStatus(message, isError = false) {
  elements.pageStatus.textContent = message;
  elements.pageStatus.classList.toggle("is-error", isError);
}

function renderErrorState(message) {
  const errorMarkup = `<div class="empty-state">${escapeHtml(message)}</div>`;
  elements.overviewCards.innerHTML = errorMarkup;
  elements.needsAttention.innerHTML = errorMarkup;
  elements.tableBody.innerHTML = `<tr><td colspan="10"><div class="empty-state">${escapeHtml(
    message
  )}</div></td></tr>`;
  elements.timeline.innerHTML = errorMarkup;
}

function parseCsv(text) {
  const rows = [];
  let currentField = "";
  let currentRow = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += character;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const cleanedRows = rows
    .map((row) => row.map((value) => value.trim()))
    .filter((row) => row.some((value) => value !== ""));

  if (cleanedRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = cleanedRows[0];
  const dataRows = cleanedRows.slice(1).map((row) => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });

    return record;
  });

  return { headers, rows: dataRows };
}

function resolveColumnMapping(headers) {
  const mapping = {};

  Object.entries(COLUMN_CANDIDATES).forEach(([key, candidates]) => {
    mapping[key] = candidates.find((candidate) => headers.includes(candidate)) || null;
  });

  return mapping;
}

function getMissingColumns(mapping, fields) {
  return fields.filter((field) => !mapping[field]);
}

function buildApplication(row, index) {
  const university = getMappedValue(row, "university");
  const course = getMappedValue(row, "course");
  const applicationDeadlineRaw = getMappedValue(row, "applicationDeadline");
  const courseStartRaw = getMappedValue(row, "courseStartDate");
  const appliedStatus = getMappedValue(row, "appliedStatus");
  const acsAccredited = getMappedValue(row, "acsAccredited");
  const preferenceRaw = getMappedValue(row, "preference");

  const applicationDeadline = parseDateValue(applicationDeadlineRaw);
  const courseStartDate = parseDateValue(courseStartRaw);
  const isApplied = isAppliedStatus(appliedStatus);
  const acsStatus = classifyAcsStatus(acsAccredited);
  const preferenceRank = parsePreferenceRank(preferenceRaw);

  return {
    id: `application-${index + 1}`,
    university: university || "TBC",
    course: course || "TBC",
    preferenceRaw,
    preferenceRank,
    duration: getMappedValue(row, "duration") || "TBC",
    acsLabel: acsAccredited || "Unknown",
    acsStatus,
    appliedLabel: appliedStatus || "TBC",
    isApplied,
    courseOutlineLink: getMappedValue(row, "courseOutlineLink"),
    notes: getMappedValue(row, "notes") || "TBC",
    applicationDeadlineRaw,
    courseStartRaw,
    applicationDeadline,
    courseStartDate,
    cricos: getMappedValue(row, "cricos"),
    postStudyVisaDuration: getMappedValue(row, "postStudyVisaDuration"),
    semesters: getMappedValue(row, "semesters")
  };
}

function getMappedValue(row, key) {
  const columnName = state.columnMapping[key];

  if (!columnName) {
    return "";
  }

  return (row[columnName] || "").trim();
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || /^tbc$/i.test(normalized)) {
    return null;
  }

  const dayMonthYearMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dayMonthYearMatch) {
    const [, dayText, monthText, yearText] = dayMonthYearMatch;
    const year = yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const day = Number(dayText);

    if (isValidDateParts(year, monthIndex, day)) {
      return new Date(year, monthIndex, day, 12, 0, 0, 0);
    }
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const day = Number(dayText);

    if (isValidDateParts(year, monthIndex, day)) {
      return new Date(year, monthIndex, day, 12, 0, 0, 0);
    }
  }

  const fallbackDate = new Date(normalized);
  if (!Number.isNaN(fallbackDate.getTime())) {
    fallbackDate.setHours(12, 0, 0, 0);
    return fallbackDate;
  }

  return null;
}

function isValidDateParts(year, monthIndex, day) {
  const candidate = new Date(year, monthIndex, day, 12, 0, 0, 0);

  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === monthIndex &&
    candidate.getDate() === day
  );
}

function isAppliedStatus(value) {
  const normalized = (value || "").trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("not applied") ||
    normalized.includes("not started") ||
    normalized.includes("research") ||
    normalized.includes("planning")
  ) {
    return false;
  }

  return (
    normalized.includes("applied") ||
    normalized.includes("submitted") ||
    normalized.includes("completed") ||
    normalized.includes("offer") ||
    normalized.includes("accepted")
  );
}

function classifyAcsStatus(value) {
  const normalized = (value || "").trim().toLowerCase();

  if (!normalized || normalized === "tbc" || normalized.includes("unknown")) {
    return "unknown";
  }

  if (normalized.includes("no") || normalized.includes("not accredited")) {
    return "no";
  }

  if (normalized.includes("yes") || normalized.includes("accredited")) {
    return "yes";
  }

  return "unknown";
}

function parsePreferenceRank(value) {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/\d+/);
  if (!match) {
    return null;
  }

  const rank = Number(match[0]);
  return Number.isFinite(rank) && rank > 0 ? rank : null;
}

function renderAll() {
  state.filteredApplications = getFilteredApplications();

  renderOverviewCards();
  renderNeedsAttention();
  renderTable();
  renderTimeline();
}

function getFilteredApplications() {
  const filtered = state.applications.filter((application) => {
    if (!matchesSearch(application, state.filters.search)) {
      return false;
    }

    if (!matchesAppliedFilter(application, state.filters.applied)) {
      return false;
    }

    if (!matchesAcsFilter(application, state.filters.acs)) {
      return false;
    }

    return true;
  });

  return filtered.sort((left, right) => compareByDeadline(left, right, state.filters.sort));
}

function matchesSearch(application, searchValue) {
  if (!searchValue) {
    return true;
  }

  const haystack = `${application.university} ${application.course}`.toLowerCase();
  return haystack.includes(searchValue);
}

function matchesAppliedFilter(application, filterValue) {
  if (filterValue === "all") {
    return true;
  }

  if (filterValue === "applied") {
    return application.isApplied;
  }

  return !application.isApplied;
}

function matchesAcsFilter(application, filterValue) {
  if (filterValue === "all") {
    return true;
  }

  return application.acsStatus === filterValue;
}

function compareByDeadline(left, right, sortOrder) {
  const leftHasDate = Boolean(left.applicationDeadline);
  const rightHasDate = Boolean(right.applicationDeadline);

  if (!leftHasDate && !rightHasDate) {
    return `${left.university} ${left.course}`.localeCompare(`${right.university} ${right.course}`);
  }

  if (!leftHasDate) {
    return 1;
  }

  if (!rightHasDate) {
    return -1;
  }

  const leftTime = left.applicationDeadline.getTime();
  const rightTime = right.applicationDeadline.getTime();

  if (leftTime === rightTime) {
    return `${left.university} ${left.course}`.localeCompare(`${right.university} ${right.course}`);
  }

  if (sortOrder === "deadline-desc") {
    return rightTime - leftTime;
  }

  return leftTime - rightTime;
}

function renderOverviewCards() {
  const total = state.applications.length;
  const submitted = state.applications.filter((application) => application.isApplied).length;
  const notSubmitted = total - submitted;
  const upcomingDeadlines = state.applications.filter((application) => {
    const deadlineState = getDeadlineState(application.applicationDeadline);
    return deadlineState.tone === "urgent" || deadlineState.tone === "upcoming";
  }).length;
  const earliestUpcomingDeadline = getNextUpcomingDate(
    state.applications.map((application) => application.applicationDeadline)
  );
  const nextCourseStart = getNextUpcomingDate(
    state.applications.map((application) => application.courseStartDate)
  );

  const cards = [
    {
      label: "Total courses tracked",
      value: String(total),
      note: "Counted from the CSV file."
    },
    {
      label: "Applications submitted",
      value: String(submitted),
      note: `${submitted} currently marked as applied.`
    },
    {
      label: "Applications not yet submitted",
      value: String(notSubmitted),
      note: `${notSubmitted} still need submission or confirmation.`
    },
    {
      label: "Upcoming deadlines within 30 days",
      value: String(upcomingDeadlines),
      note: "Includes urgent deadlines in the next 14 days."
    },
    {
      label: "Earliest upcoming deadline",
      value: formatDateLabel(earliestUpcomingDeadline),
      note: earliestUpcomingDeadline ? "Next future application deadline." : "No future deadline found."
    },
    {
      label: "Next course start date",
      value: formatDateLabel(nextCourseStart),
      note: nextCourseStart ? "Next future course intake date." : "No future start date found."
    }
  ];

  elements.overviewCards.innerHTML = cards
    .map(
      (card) => `
        <article class="overview-card">
          <h3>${escapeHtml(card.label)}</h3>
          <p class="overview-value">${escapeHtml(card.value)}</p>
          <p class="overview-note">${escapeHtml(card.note)}</p>
        </article>
      `
    )
    .join("");
}

function renderNeedsAttention() {
  const items = state.applications
    .map((application) => ({
      application,
      reasons: getAttentionReasons(application)
    }))
    .filter((item) => item.reasons.length > 0)
    .sort((left, right) => compareByDeadline(left.application, right.application, "deadline-asc"));

  if (items.length === 0) {
    elements.needsAttention.innerHTML =
      '<div class="empty-state">Nothing needs attention right now.</div>';
    return;
  }

  elements.needsAttention.innerHTML = items
    .map(
      ({ application, reasons }) => `
        <article class="attention-card">
          <h3>${renderPreferenceBadge(application)} ${escapeHtml(application.university)} - ${escapeHtml(
            application.course
          )}</h3>
          <p>${escapeHtml(
            `Deadline: ${getDisplayDate(application.applicationDeadlineRaw, application.applicationDeadline)} - Applied: ${application.appliedLabel || "TBC"}`
          )}</p>
          <div class="attention-reasons">
            ${reasons
              .map((reason) => `<span class="reason-pill">${escapeHtml(reason)}</span>`)
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function getAttentionReasons(application) {
  const reasons = [];
  const deadlineState = getDeadlineState(application.applicationDeadline);

  if (!application.isApplied && deadlineState.tone === "upcoming") {
    reasons.push("Not applied yet and deadline is within 30 days");
  }

  if (!application.isApplied && deadlineState.tone === "urgent") {
    reasons.push("Not applied yet and deadline is within 14 days");
  }

  if (!application.isApplied && deadlineState.tone === "passed") {
    reasons.push("Deadline has passed and application is not marked as applied");
  }

  if (!application.applicationDeadline) {
    reasons.push("Application deadline is missing");
  }

  if (!application.courseOutlineLink) {
    reasons.push("Course outline link is missing");
  }

  if (application.acsStatus === "unknown") {
    reasons.push("ACS accreditation is unknown");
  }

  return reasons;
}

function renderTable() {
  if (state.filteredApplications.length === 0) {
    elements.tableBody.innerHTML =
      '<tr><td colspan="10"><div class="empty-state">No courses match the current filters.</div></td></tr>';
    return;
  }

  elements.tableBody.innerHTML = state.filteredApplications
    .map((application) => {
      const deadlineState = getDeadlineState(application.applicationDeadline);
      const outlineLinkMarkup = application.courseOutlineLink
        ? `<a class="course-link" href="${escapeAttribute(
            application.courseOutlineLink
          )}" target="_blank" rel="noreferrer">Open</a>`
        : '<span class="course-link is-missing">TBC</span>';

      const detailsMarkup = renderDetailsMarkup(application, outlineLinkMarkup);

      return `
        <tr>
          <td>${escapeHtml(application.university)}</td>
          <td>
            <div class="course-cell">
              <span class="course-name">${escapeHtml(application.course)}</span>
              ${renderPreferenceBadge(application)}
            </div>
          </td>
          <td>${escapeHtml(getDisplayDate(application.courseStartRaw, application.courseStartDate))}</td>
          <td>
            <div class="deadline-cell">
              <span class="deadline-date">${escapeHtml(
                getDisplayDate(application.applicationDeadlineRaw, application.applicationDeadline)
              )}</span>
              <span class="deadline-tag ${deadlineState.className}">${escapeHtml(
                deadlineState.label
              )}</span>
            </div>
          </td>
          <td>${escapeHtml(application.duration)}</td>
          <td>${escapeHtml(application.acsLabel)}</td>
          <td>${renderStatusPill(application)}</td>
          <td>${outlineLinkMarkup}</td>
          <td>${escapeHtml(application.notes)}</td>
          <td>
            <button
              class="details-button"
              type="button"
              data-details-button
              data-row-id="${escapeAttribute(application.id)}"
              aria-expanded="false"
            >
              Details
            </button>
          </td>
        </tr>
        <tr class="details-row" data-details-row="${escapeAttribute(application.id)}" hidden>
          <td colspan="10">${detailsMarkup}</td>
        </tr>
      `;
    })
    .join("");
}

function renderDetailsMarkup(application, outlineLinkMarkup) {
  const detailItems = [
    { label: "Preference", value: getPreferenceText(application) },
    { label: "Full course name", value: application.course },
    { label: "University", value: application.university },
    { label: "Duration", value: application.duration },
    { label: "ACS accreditation", value: application.acsLabel },
    {
      label: "Application deadline",
      value: getDisplayDate(application.applicationDeadlineRaw, application.applicationDeadline)
    },
    { label: "Course start date", value: getDisplayDate(application.courseStartRaw, application.courseStartDate) },
    { label: "Application status", value: application.appliedLabel || "TBC" },
    { label: "Notes", value: application.notes },
    { label: "Official course outline link", value: outlineLinkMarkup, isHtml: true },
    { label: "CRICOS", value: application.cricos || "TBC" },
    { label: "Post-study visa duration", value: application.postStudyVisaDuration || "TBC" },
    { label: "Semesters", value: application.semesters || "TBC" }
  ];

  return `
    <div class="details-panel">
      <dl class="details-grid">
        ${detailItems
          .map(
            (item) => `
              <div class="details-item">
                <dt>${escapeHtml(item.label)}</dt>
                <dd>${item.isHtml ? item.value : escapeHtml(item.value)}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
    </div>
  `;
}

function renderStatusPill(application) {
  if (!application.appliedLabel || application.appliedLabel === "TBC") {
    return '<span class="status-pill unknown">TBC</span>';
  }

  const className = application.isApplied ? "applied" : "not-applied";
  return `<span class="status-pill ${className}">${escapeHtml(application.appliedLabel)}</span>`;
}

function renderPreferenceBadge(application) {
  if (!application.preferenceRank) {
    return "";
  }

  let className = "preference-badge";

  if (application.preferenceRank === 1) {
    className += " top-choice";
  }

  if (application.preferenceRank === 4) {
    className += " fourth-choice";
  }

  return `<span class="${className.trim()}" title="${escapeAttribute(
    getPreferenceText(application)
  )}" aria-label="${escapeAttribute(getPreferenceText(application))}">${escapeHtml(
    getPreferenceShortLabel(application)
  )}</span>`;
}

function getPreferenceText(application) {
  if (!application.preferenceRank) {
    return "TBC";
  }

  return `${formatOrdinal(application.preferenceRank)} choice`;
}

function getPreferenceShortLabel(application) {
  if (!application.preferenceRank) {
    return "TBC";
  }

  return `${formatOrdinal(application.preferenceRank)} choice`;
}

function formatOrdinal(number) {
  const remainder10 = number % 10;
  const remainder100 = number % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${number}st`;
  }

  if (remainder10 === 2 && remainder100 !== 12) {
    return `${number}nd`;
  }

  if (remainder10 === 3 && remainder100 !== 13) {
    return `${number}rd`;
  }

  return `${number}th`;
}

function getDeadlineState(date) {
  if (!date) {
    return {
      label: "TBC",
      tone: "missing",
      className: "deadline-missing"
    };
  }

  const today = getStartOfToday();
  const differenceInDays = Math.floor((date.getTime() - today.getTime()) / 86400000);

  if (differenceInDays < 0) {
    return {
      label: "Deadline passed",
      tone: "passed",
      className: "deadline-passed"
    };
  }

  if (differenceInDays <= 14) {
    return {
      label: "Urgent",
      tone: "urgent",
      className: "deadline-urgent"
    };
  }

  if (differenceInDays <= 30) {
    return {
      label: "Upcoming",
      tone: "upcoming",
      className: "deadline-upcoming"
    };
  }

  return {
    label: "Normal",
    tone: "normal",
    className: "deadline-normal"
  };
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getNextUpcomingDate(dates) {
  const today = getStartOfToday();

  return dates
    .filter((date) => date && date.getTime() >= today.getTime())
    .sort((left, right) => left.getTime() - right.getTime())[0] || null;
}

function renderTimeline() {
  if (state.filteredApplications.length === 0) {
    elements.timeline.innerHTML =
      '<div class="empty-state">No courses match the current filters.</div>';
    return;
  }

  const bounds = getTimelineBounds(state.filteredApplications);

  if (!bounds) {
    elements.timeline.innerHTML =
      '<div class="empty-state">No valid dates are available for the timeline yet.</div>';
    return;
  }

  const { minimumDate, maximumDate, referenceDate } = bounds;
  const axisMarkup = renderTimelineAxis(minimumDate, maximumDate, referenceDate);
  const rowsMarkup = state.filteredApplications.map((application) =>
    renderTimelineRow(application, minimumDate, maximumDate, referenceDate)
  );

  elements.timeline.innerHTML = `
    <div class="timeline-inner">
      ${axisMarkup}
      ${rowsMarkup.join("")}
    </div>
  `;
}

function getTimelineBounds(applications) {
  const deadlineDates = applications
    .map((application) => application.applicationDeadline)
    .filter(Boolean);
  const courseStartDates = applications
    .map((application) => application.courseStartDate)
    .filter(Boolean);
  const validDates = [...deadlineDates, ...courseStartDates];

  if (validDates.length === 0) {
    return null;
  }

  let minimumDate = deadlineDates.length
    ? new Date(Math.min(...deadlineDates.map((date) => date.getTime())))
    : new Date(Math.min(...validDates.map((date) => date.getTime())));
  let maximumDate = courseStartDates.length
    ? new Date(Math.max(...courseStartDates.map((date) => date.getTime())))
    : new Date(Math.max(...validDates.map((date) => date.getTime())));

  if (minimumDate.getTime() > maximumDate.getTime()) {
    minimumDate = new Date(Math.min(...validDates.map((date) => date.getTime())));
    maximumDate = new Date(Math.max(...validDates.map((date) => date.getTime())));
  }

  const referenceDate = getStartOfToday();
  if (referenceDate.getTime() < minimumDate.getTime()) {
    minimumDate = new Date(referenceDate.getTime());
  }

  if (minimumDate.getTime() === maximumDate.getTime()) {
    minimumDate.setDate(minimumDate.getDate() - 14);
    maximumDate.setDate(maximumDate.getDate() + 14);
  }

  return { minimumDate, maximumDate, referenceDate };
}

function renderTimelineAxis(minimumDate, maximumDate, referenceDate) {
  const totalDuration = maximumDate.getTime() - minimumDate.getTime();
  const referencePosition = isDateWithinRange(referenceDate, minimumDate, maximumDate)
    ? getTimelinePosition(referenceDate, minimumDate, totalDuration)
    : null;
  const ticks = getTimelineTickDates(minimumDate, maximumDate).map((tickDate, index, allTicks) => `
    <div class="axis-tick" style="left: ${getTimelinePosition(tickDate, minimumDate, totalDuration)}%;">
      <span class="axis-label">${escapeHtml(
        getTimelineTickLabel(tickDate, index, allTicks.length)
      )}</span>
    </div>
  `);

  return `
    <div class="timeline-axis">
      <div class="timeline-axis-label">
        <span class="timeline-axis-title">Reference date</span>
        <strong>${escapeHtml(formatDateLabel(referenceDate))}</strong>
      </div>
      <div class="timeline-axis-track">
        <div class="axis-line"></div>
        ${
          referencePosition === null
            ? ""
            : `<div class="axis-reference" style="left: ${referencePosition}%;">
                <span class="axis-reference-label">Today<br>${escapeHtml(
                  formatShortDateLabel(referenceDate)
                )}</span>
              </div>`
        }
        ${ticks.join("")}
      </div>
    </div>
  `;
}

function getTimelineTickDates(minimumDate, maximumDate) {
  const tickDates = [new Date(minimumDate.getTime())];
  const cursor = new Date(minimumDate.getFullYear(), minimumDate.getMonth() + 1, 1, 12, 0, 0, 0);

  while (cursor.getTime() < maximumDate.getTime()) {
    tickDates.push(new Date(cursor.getTime()));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  tickDates.push(new Date(maximumDate.getTime()));

  const seen = new Set();
  return tickDates.filter((tickDate) => {
    const key = tickDate.toDateString();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getTimelineTickLabel(date, index, totalTicks) {
  if (index === 0 || index === totalTicks - 1) {
    return formatShortDateLabel(date);
  }

  return MONTH_FORMATTER.format(date);
}

function renderTimelineRow(application, minimumDate, maximumDate, referenceDate) {
  const totalDuration = maximumDate.getTime() - minimumDate.getTime();
  const deadlinePosition = getTimelinePosition(
    application.applicationDeadline,
    minimumDate,
    totalDuration
  );
  const startPosition = getTimelinePosition(application.courseStartDate, minimumDate, totalDuration);
  const referencePosition = isDateWithinRange(referenceDate, minimumDate, maximumDate)
    ? getTimelinePosition(referenceDate, minimumDate, totalDuration)
    : null;
  const rowClass = application.isApplied ? "applied" : "not-applied";
  const notes = [];

  if (!application.applicationDeadline) {
    notes.push("Deadline TBC");
  }

  if (!application.courseStartDate) {
    notes.push("Course start TBC");
  }

  return `
    <div class="timeline-row">
      <div class="timeline-label">
        <strong>${escapeHtml(application.university)}</strong>
        <span class="timeline-course">${escapeHtml(application.course)}</span>
        ${renderPreferenceBadge(application)}
        <div class="timeline-meta">
          <span class="timeline-chip">Deadline ${escapeHtml(
            getDisplayDate(application.applicationDeadlineRaw, application.applicationDeadline)
          )}</span>
          <span class="timeline-chip">Starts ${escapeHtml(
            getDisplayDate(application.courseStartRaw, application.courseStartDate)
          )}</span>
        </div>
        ${renderStatusPill(application)}
      </div>
      <div class="timeline-track ${rowClass}">
        <div class="track-line"></div>
        ${
          referencePosition === null
            ? ""
            : `<span class="track-reference-line" style="left: ${referencePosition}%"></span>`
        }
        ${
          deadlinePosition === null
            ? ""
            : renderTimelineMarker(
                deadlinePosition,
                "deadline",
                formatShortDateLabel(application.applicationDeadline),
                getDisplayDate(application.applicationDeadlineRaw, application.applicationDeadline)
              )
        }
        ${
          startPosition === null
            ? ""
            : renderTimelineMarker(
                startPosition,
                "start",
                formatShortDateLabel(application.courseStartDate),
                getDisplayDate(application.courseStartRaw, application.courseStartDate)
              )
        }
        ${
          notes.length > 0
            ? `<span class="timeline-note">${escapeHtml(notes.join(" | "))}</span>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderTimelineMarker(position, type, shortLabel, fullLabel) {
  const eventLabel = type === "deadline" ? "Application deadline" : "Course start";

  return `
    <span class="timeline-date-label ${type}" style="left: ${position}%">${escapeHtml(
      shortLabel
    )}</span>
    <button
      class="timeline-marker marker-${type}"
      type="button"
      style="left: ${position}%"
      data-tooltip="${escapeAttribute(`${eventLabel}: ${fullLabel}`)}"
      aria-label="${escapeAttribute(`${eventLabel}: ${fullLabel}`)}"
    ></button>
  `;
}

function getTimelinePosition(date, minimumDate, totalDuration) {
  if (!date) {
    return null;
  }

  if (totalDuration <= 0) {
    return 50;
  }

  const ratio = (date.getTime() - minimumDate.getTime()) / totalDuration;
  return TIMELINE_EDGE_PADDING_PERCENT + ratio * (100 - TIMELINE_EDGE_PADDING_PERCENT * 2);
}

function isDateWithinRange(date, minimumDate, maximumDate) {
  if (!date) {
    return false;
  }

  return date.getTime() >= minimumDate.getTime() && date.getTime() <= maximumDate.getTime();
}

function getDisplayDate(rawValue, parsedDate) {
  if (parsedDate) {
    return formatDateLabel(parsedDate);
  }

  if (rawValue) {
    return rawValue;
  }

  return "TBC";
}

function formatDateLabel(date) {
  if (!date) {
    return "TBC";
  }

  return DATE_FORMATTER.format(date);
}

function formatShortDateLabel(date) {
  if (!date) {
    return "TBC";
  }

  return SHORT_DATE_FORMATTER.format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
