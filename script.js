const sampleCsv = `Region,Year,Population,Income,Literacy,InternetUsers
North,2019,3120000,42000,88,1920000
North,2020,3265000,43800,89,2090000
North,2021,3412000,,90,2260000
South,2019,2850000,39100,84,1630000
South,2020,2975000,40500,85,1780000
South,2021,3098000,42100,86,
East,2019,2410000,35200,81,1210000
East,2020,2522000,36800,,1360000
East,2021,2637000,38200,83,1490000
West,2019,2740000,44800,87,1710000
West,2020,2862000,46200,88,1880000
West,2021,2995000,48100,90,2060000
West,2021,2995000,48100,90,2060000`;

const elements = {
  csvUpload: document.querySelector("#csvUpload"),
  fileName: document.querySelector("#fileName"),
  sampleButton: document.querySelector("#sampleButton"),
  rowCount: document.querySelector("#rowCount"),
  columnCount: document.querySelector("#columnCount"),
  missingCount: document.querySelector("#missingCount"),
  numericCount: document.querySelector("#numericCount"),
  columnFilters: document.querySelector("#columnFilters"),
  sortColumn: document.querySelector("#sortColumn"),
  sortDirection: document.querySelector("#sortDirection"),
  applySort: document.querySelector("#applySort"),
  removeMissing: document.querySelector("#removeMissing"),
  fillMissing: document.querySelector("#fillMissing"),
  removeDuplicates: document.querySelector("#removeDuplicates"),
  chartType: document.querySelector("#chartType"),
  xColumn: document.querySelector("#xColumn"),
  yColumn: document.querySelector("#yColumn"),
  drawChart: document.querySelector("#drawChart"),
  downloadCsv: document.querySelector("#downloadCsv"),
  downloadReport: document.querySelector("#downloadReport"),
  previewNote: document.querySelector("#previewNote"),
  dataPreview: document.querySelector("#dataPreview"),
  missingValues: document.querySelector("#missingValues"),
  summaryStats: document.querySelector("#summaryStats"),
  correlationMatrix: document.querySelector("#correlationMatrix"),
  chartArea: document.querySelector("#chartArea"),
};

const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

let state = {
  columns: [],
  rows: [],
  visibleColumns: [],
  sourceName: "",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("The CSV needs a header row and at least one data row.");
  }

  const columns = rows[0].map((column, index) => column || `Column ${index + 1}`);
  const dataRows = rows.slice(1).map((cells) =>
    columns.reduce((record, column, index) => {
      record[column] = cells[index] ?? "";
      return record;
    }, {})
  );

  return { columns, rows: dataRows };
}

function isMissing(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function toNumber(value) {
  if (isMissing(value)) {
    return null;
  }
  const cleaned = String(value).replace(/[$,%]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumericColumn(column) {
  const values = state.rows.map((row) => row[column]).filter((value) => !isMissing(value));
  return values.length > 0 && values.every((value) => toNumber(value) !== null);
}

function numericColumns() {
  return state.columns.filter(isNumericColumn);
}

function missingByColumn() {
  return state.columns.map((column) => ({
    column,
    missing: state.rows.filter((row) => isMissing(row[column])).length,
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderTable(container, columns, rows, options = {}) {
  if (!rows.length || !columns.length) {
    container.className = "table-wrap empty-state";
    container.textContent = options.emptyText || "No data available.";
    return;
  }

  container.className = "table-wrap";
  container.innerHTML = `
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${columns
                  .map((column) => {
                    const value = row[column];
                    const missingClass = isMissing(value) ? " class=\"missing\"" : "";
                    return `<td${missingClass}>${isMissing(value) ? "Missing" : escapeHtml(value)}</td>`;
                  })
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function populateSelect(select, columns, placeholder = "Choose column") {
  select.innerHTML = `<option value="">${placeholder}</option>${columns
    .map((column) => `<option value="${escapeHtml(column)}">${escapeHtml(column)}</option>`)
    .join("")}`;
}

function refreshControls() {
  if (!state.columns.length) {
    elements.columnFilters.className = "checkbox-list empty-state";
    elements.columnFilters.textContent = "Upload a CSV to choose visible columns.";
    [elements.sortColumn, elements.xColumn, elements.yColumn].forEach((select) =>
      populateSelect(select, [])
    );
    return;
  }

  elements.columnFilters.className = "checkbox-list";
  elements.columnFilters.innerHTML = state.columns
    .map(
      (column) => `
        <label class="checkbox-item">
          <input type="checkbox" value="${escapeHtml(column)}" ${
        state.visibleColumns.includes(column) ? "checked" : ""
      } />
          ${escapeHtml(column)}
        </label>
      `
    )
    .join("");

  populateSelect(elements.sortColumn, state.columns, "No sort");
  populateSelect(elements.xColumn, state.columns, "Choose X column");
  populateSelect(elements.yColumn, numericColumns(), "Choose numeric Y column");
}

function renderMetrics() {
  const missingTotal = missingByColumn().reduce((sum, item) => sum + item.missing, 0);

  elements.rowCount.textContent = numberFormat.format(state.rows.length);
  elements.columnCount.textContent = numberFormat.format(state.columns.length);
  elements.missingCount.textContent = numberFormat.format(missingTotal);
  elements.numericCount.textContent = numberFormat.format(numericColumns().length);
}

function renderPreview() {
  const previewRows = state.rows.slice(0, 12);
  elements.previewNote.textContent = state.rows.length
    ? `Showing ${previewRows.length} of ${state.rows.length} rows`
    : "Waiting for CSV";
  renderTable(elements.dataPreview, state.visibleColumns, previewRows, {
    emptyText: state.rows.length
      ? "Select at least one visible column."
      : "Upload a CSV file or load the sample dataset to begin.",
  });
}

function renderMissingValues() {
  const rows = missingByColumn().map((item) => ({
    Column: item.column,
    "Missing cells": item.missing,
    "Missing %": state.rows.length ? `${((item.missing / state.rows.length) * 100).toFixed(1)}%` : "0%",
  }));

  renderTable(elements.missingValues, ["Column", "Missing cells", "Missing %"], rows, {
    emptyText: "No dataset loaded.",
  });
}

function calculateSummary() {
  return numericColumns().map((column) => {
    const values = state.rows.map((row) => toNumber(row[column])).filter((value) => value !== null);
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((total, value) => total + value, 0);
    const mean = sum / values.length;
    const middle = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

    return {
      Column: column,
      Count: values.length,
      Mean: mean.toFixed(2),
      Median: median.toFixed(2),
      Min: Math.min(...values).toFixed(2),
      Max: Math.max(...values).toFixed(2),
    };
  });
}

function renderSummary() {
  renderTable(elements.summaryStats, ["Column", "Count", "Mean", "Median", "Min", "Max"], calculateSummary(), {
    emptyText: "No numeric data yet.",
  });
}

function correlation(columnA, columnB) {
  const pairs = state.rows
    .map((row) => [toNumber(row[columnA]), toNumber(row[columnB])])
    .filter(([a, b]) => a !== null && b !== null);

  if (pairs.length < 2) {
    return null;
  }

  const meanA = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let varianceA = 0;
  let varianceB = 0;

  pairs.forEach(([a, b]) => {
    numerator += (a - meanA) * (b - meanB);
    varianceA += (a - meanA) ** 2;
    varianceB += (b - meanB) ** 2;
  });

  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator === 0 ? null : numerator / denominator;
}

function renderCorrelationMatrix() {
  const columns = numericColumns();

  if (columns.length < 2) {
    elements.correlationMatrix.className = "table-wrap empty-state";
    elements.correlationMatrix.textContent = "Need at least two numeric columns.";
    return;
  }

  elements.correlationMatrix.className = "table-wrap";
  elements.correlationMatrix.innerHTML = `
    <table class="correlation-table">
      <thead>
        <tr>
          <th>Column</th>
          ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${columns
          .map(
            (rowColumn) => `
              <tr>
                <th>${escapeHtml(rowColumn)}</th>
                ${columns
                  .map((column) => {
                    const value = correlation(rowColumn, column);
                    const className =
                      value === null
                        ? "corr-neutral"
                        : value > 0.35
                          ? "corr-positive"
                          : value < -0.35
                            ? "corr-negative"
                            : "corr-neutral";
                    return `<td class="${className}">${value === null ? "-" : value.toFixed(2)}</td>`;
                  })
                  .join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function refreshAll() {
  renderMetrics();
  refreshControls();
  renderPreview();
  renderMissingValues();
  renderSummary();
  renderCorrelationMatrix();
}

function loadCsv(text, sourceName) {
  const parsed = parseCsv(text);
  state = {
    columns: parsed.columns,
    rows: parsed.rows,
    visibleColumns: [...parsed.columns],
    sourceName,
  };
  elements.fileName.textContent = sourceName;
  elements.chartArea.className = "chart-area empty-state";
  elements.chartArea.textContent = "Choose columns and generate a chart.";
  refreshAll();
}

function removeRowsWithMissingValues() {
  state.rows = state.rows.filter((row) => state.columns.every((column) => !isMissing(row[column])));
  refreshAll();
}

function fillMissingValues() {
  const numeric = numericColumns();

  state.columns.forEach((column) => {
    const values = state.rows.map((row) => row[column]).filter((value) => !isMissing(value));
    if (!values.length) {
      return;
    }

    let replacement;
    if (numeric.includes(column)) {
      const numbers = values.map(toNumber);
      replacement = (
        numbers.reduce((sum, value) => sum + value, 0) / numbers.length
      ).toFixed(2);
    } else {
      const counts = values.reduce((map, value) => {
        map[value] = (map[value] || 0) + 1;
        return map;
      }, {});
      replacement = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    }

    state.rows.forEach((row) => {
      if (isMissing(row[column])) {
        row[column] = replacement;
      }
    });
  });

  refreshAll();
}

function removeDuplicateRows() {
  const seen = new Set();
  state.rows = state.rows.filter((row) => {
    const key = JSON.stringify(state.columns.map((column) => row[column]));
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  refreshAll();
}

function sortRows() {
  const column = elements.sortColumn.value;
  const direction = elements.sortDirection.value === "desc" ? -1 : 1;

  if (!column) {
    return;
  }

  state.rows.sort((a, b) => {
    const aNumber = toNumber(a[column]);
    const bNumber = toNumber(b[column]);

    if (aNumber !== null && bNumber !== null) {
      return (aNumber - bNumber) * direction;
    }

    return String(a[column]).localeCompare(String(b[column])) * direction;
  });

  renderPreview();
}

function chartData(xColumn, yColumn) {
  return state.rows
    .map((row) => ({
      x: row[xColumn],
      y: toNumber(row[yColumn]),
    }))
    .filter((item) => !isMissing(item.x) && item.y !== null)
    .slice(0, 24);
}

function renderChart() {
  const xColumn = elements.xColumn.value;
  const yColumn = elements.yColumn.value;
  const type = elements.chartType.value;
  const data = chartData(xColumn, yColumn);

  if (!xColumn || !yColumn || !data.length) {
    elements.chartArea.className = "chart-area empty-state";
    elements.chartArea.textContent = "Choose valid X and numeric Y columns to generate a chart.";
    return;
  }

  const width = 920;
  const height = 360;
  const padding = { top: 28, right: 28, bottom: 78, left: 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minY = Math.min(0, ...data.map((item) => item.y));
  const maxY = Math.max(...data.map((item) => item.y));
  const yRange = maxY - minY || 1;
  const xStep = chartWidth / Math.max(data.length - 1, 1);
  const barWidth = Math.max(12, Math.min(42, chartWidth / data.length - 8));

  const yScale = (value) => padding.top + chartHeight - ((value - minY) / yRange) * chartHeight;
  const xScale = (index) => padding.left + (data.length === 1 ? chartWidth / 2 : index * xStep);
  const pointList = data.map((item, index) => ({ ...item, xPos: xScale(index), yPos: yScale(item.y) }));
  const linePath = pointList.map((point, index) => `${index === 0 ? "M" : "L"} ${point.xPos} ${point.yPos}`).join(" ");

  const marks =
    type === "bar"
      ? pointList
          .map(
            (point) => `
              <rect class="bar" x="${point.xPos - barWidth / 2}" y="${point.yPos}" width="${barWidth}" height="${
                padding.top + chartHeight - point.yPos
              }" rx="5"></rect>
            `
          )
          .join("")
      : type === "line"
        ? `<path class="line-path" d="${linePath}"></path>${pointList
            .map((point) => `<circle class="dot" cx="${point.xPos}" cy="${point.yPos}" r="5"></circle>`)
            .join("")}`
        : pointList
            .map((point) => `<circle class="dot" cx="${point.xPos}" cy="${point.yPos}" r="6"></circle>`)
            .join("");

  elements.chartArea.className = "chart-area";
  elements.chartArea.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(
      `${type} chart of ${yColumn} by ${xColumn}`
    )}">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((step) => {
          const y = padding.top + chartHeight * step;
          const value = maxY - yRange * step;
          return `
            <line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
            <text class="axis-label" x="18" y="${y + 4}">${compactFormat.format(value)}</text>
          `;
        })
        .join("")}
      <line class="axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${
        padding.top + chartHeight
      }"></line>
      <line class="axis" x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${
        width - padding.right
      }" y2="${padding.top + chartHeight}"></line>
      ${marks}
      ${pointList
        .map(
          (point, index) => `
            <text class="axis-label" x="${point.xPos}" y="${height - 38}" text-anchor="end" transform="rotate(-35 ${point.xPos} ${
              height - 38
            })">${escapeHtml(String(point.x)).slice(0, 18)}</text>
            ${
              index % 2 === 0
                ? `<text class="axis-label" x="${point.xPos}" y="${point.yPos - 10}" text-anchor="middle">${compactFormat.format(point.y)}</text>`
                : ""
            }
          `
        )
        .join("")}
      <text class="axis-label" x="${width / 2}" y="${height - 6}" text-anchor="middle">${escapeHtml(xColumn)}</text>
      <text class="axis-label" x="14" y="${height / 2}" text-anchor="middle" transform="rotate(-90 14 ${height / 2})">${escapeHtml(
        yColumn
      )}</text>
    </svg>
  `;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCleanedCsv() {
  if (!state.rows.length) {
    return;
  }

  const csv = [
    state.columns.map(csvEscape).join(","),
    ...state.rows.map((row) => state.columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");

  downloadFile("cleaned-data.csv", csv, "text/csv;charset=utf-8");
}

function downloadReport() {
  if (!state.rows.length) {
    return;
  }

  const missingRows = missingByColumn()
    .map((item) => `- ${item.column}: ${item.missing}`)
    .join("\n");
  const statsRows = calculateSummary()
    .map((row) => `- ${row.Column}: mean ${row.Mean}, median ${row.Median}, min ${row.Min}, max ${row.Max}`)
    .join("\n");

  const report = `Data Analytics Report
Source: ${state.sourceName || "Uploaded CSV"}
Rows: ${state.rows.length}
Columns: ${state.columns.length}
Numeric columns: ${numericColumns().join(", ") || "None"}

Missing Values
${missingRows}

Summary Statistics
${statsRows || "No numeric columns found."}
`;

  downloadFile("data-analysis-report.txt", report, "text/plain;charset=utf-8");
}

function ensureDataset(action) {
  if (!state.rows.length) {
    return;
  }
  action();
}

elements.csvUpload.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      loadCsv(reader.result, file.name);
    } catch (error) {
      alert(error.message);
    }
  });
  reader.readAsText(file);
});

elements.sampleButton.addEventListener("click", () => loadCsv(sampleCsv, "sample-data.csv"));
elements.columnFilters.addEventListener("change", () => {
  state.visibleColumns = [...elements.columnFilters.querySelectorAll("input:checked")].map(
    (input) => input.value
  );
  renderPreview();
});
elements.applySort.addEventListener("click", () => ensureDataset(sortRows));
elements.removeMissing.addEventListener("click", () => ensureDataset(removeRowsWithMissingValues));
elements.fillMissing.addEventListener("click", () => ensureDataset(fillMissingValues));
elements.removeDuplicates.addEventListener("click", () => ensureDataset(removeDuplicateRows));
elements.drawChart.addEventListener("click", () => ensureDataset(renderChart));
elements.downloadCsv.addEventListener("click", () => ensureDataset(downloadCleanedCsv));
elements.downloadReport.addEventListener("click", () => ensureDataset(downloadReport));

refreshAll();
