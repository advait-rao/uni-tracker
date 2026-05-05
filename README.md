# University Application Tracker

This is a simple static website for tracking university applications from a CSV file. The CSV file is the only data source, so the site is easy to host on GitHub Pages, Netlify, or any other static hosting platform.

## Files

```text
/
  index.html
  styles.css
  app.js
  /data
    applications.csv
```

## Run locally

Because the site uses `fetch()` to load `data/applications.csv`, open it through a local web server instead of double-clicking `index.html`.

### Option 1: Python

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

### Option 2: VS Code Live Server

If you use VS Code, you can run the site with the Live Server extension.

## Update `data/applications.csv`

`data/applications.csv` is the single source of truth for the dashboard.

1. Open `/Users/advait/Code/uni-tracker/data/applications.csv`.
2. Edit existing rows or add new rows.
3. Keep the header row in place.
4. Refresh the browser.

The current CSV uses these headers:

```csv
Uni,Program,Preference,Application Deadline,Course Start Date,Course Duration,ACS Accredited,CRICOS,Post Study Visa Duration,Semesters,Application Status,Course Outline Link,Notes
```

## Export the Google Sheet as CSV

Your source sheet is:

[Google Sheet](https://docs.google.com/spreadsheets/d/1KejWVtIHEVp42vAePfGW8BEaddXUN-94E_JsYRoqFCU/edit?usp=sharing)

To export:

1. Open the sheet.
2. Go to `File` -> `Download` -> `Comma-separated values (.csv)`.
3. Save the export.
4. Replace `/Users/advait/Code/uni-tracker/data/applications.csv` with the new file contents.
5. If the sheet export does not include columns like `Application Status`, `Course Outline Link`, or `Notes`, add those columns back into the CSV after export.

## Update column mappings

If your spreadsheet column names change, update the mapping section near the top of [app.js](/Users/advait/Code/uni-tracker/app.js).

Look for:

```js
const COLUMN_CANDIDATES = {
  university: ["Uni", "University"],
  course: ["Program", "Course"],
  applicationDeadline: ["Application Deadline", "Deadline"],
  courseStartDate: ["Course Start Date", "Course Start", "Intake"],
  ...
};
```

The app uses the first matching header for each field.

## Reference date for alerts

The dashboard uses the browser's actual current date for urgency, overview cards, and the timeline.

## Add new CSV fields later

To extend the tracker:

1. Add the new column header to `data/applications.csv`.
2. Add that header name to `COLUMN_CANDIDATES` in [app.js](/Users/advait/Code/uni-tracker/app.js).
3. Read the value inside `buildApplication()`.
4. Render it in the table, details panel, cards, or attention logic as needed.

Placeholders already exist in `app.js` for future admissions and visa fields such as:

- `Visa application required?`
- `Visa document checklist`
- `Visa application status`
- `Visa deadline`
- `CoE received?`
- `OSHC status`
- `Deposit paid?`
- `Offer received?`
- `Acceptance deadline`

## Deploy

### GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings` -> `Pages`.
3. Set the source to deploy from the main branch root.
4. Save, then wait for the published URL.

### Netlify

1. Create a new site from your repository, or drag this folder into Netlify.
2. Use the project root as the publish directory.
3. No build command is required.

### Vercel

1. Import the repository into Vercel.
2. Choose the root directory.
3. No framework preset is required.
4. No build command is required.

## Notes

- Empty values render as `TBC` so the site does not break when a field is missing.
- The site includes filters, search, deadline highlighting, expandable details, and a simple timeline view.
- If you later want to add visa tracking, keep the CSV-first structure and extend the mapping instead of adding a backend.
