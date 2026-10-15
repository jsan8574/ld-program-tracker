# L&D Program Tracker

A web dashboard for the L&D team. Upload the tracker workbook (or CSV) and it turns into a live dashboard. Everyone can:

- see status and edit rows
- manage each topic's tasks and logistics
- post announcements
- see an activity log of every change, and restore deleted items from it
- export data back to Excel

- **Static site**: `index.html`, `css/`, `js/`. Hosted on GitHub Pages. The page contains no employee data.
- **Shared data**: a Google Sheet that everyone reads and writes through the Apps Script in `apps-script/Code.gs`. It's protected by a team passcode.
- **Template**: `templates/LD Tracker Upload Template.xlsx`.

## One-time setup: connect the shared Google Sheet (about 10 minutes)

1. Create a new Google Sheet in the L&D shared Drive and name it **L&D Program Tracker – Data**.
2. Open **Extensions → Apps Script**. Delete the sample code, paste in all of `apps-script/Code.gs`, and save.
3. Reload the Sheet and use the new menu **L&D Tracker → Set team passcode** to choose the passcode you'll share only with the L&D team. Allow the permissions it asks for the first time. You can also add it under **Project Settings → Script Properties** as `TEAM_PASSCODE`.
4. Click **Deploy → New deployment**, choose the type **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone**. The passcode is what keeps the data private, so people don't need a Google sign-in.
5. Click **Deploy** and approve the permissions. Then copy the **Web app URL**, which ends in `/exec`.
6. Paste that URL into `js/config.js` as `apiUrl`, then commit and push.
7. Share the dashboard link and the passcode with the team. Each person enters their name and the passcode once per browser.

The tabs (Program Tracker, Tasks & Logistics, Attendance, Assessments, Training Survey, Announcements, Activity Log, _Change Log) are created automatically the first time someone saves. Activity Log is append-only: the script refuses edits and deletes to it.

**If you change Code.gs later**, go to **Deploy → Manage deployments → Edit → Version: New version**. This keeps the same URL.

## Running without the shared sheet

If `apiUrl` is empty, the dashboard runs in **local-only** mode. Data is saved in that browser only, and the sidebar shows "Local only · not shared". This is handy for trying it out.

## Data notes

- *Days Remaining* is calculated from *Implementation Date* every day, and is added back when you export.
- *Readiness* is the share of checklist steps that are done: Content, Internal approval, Flyers, Invitations, Surveys and Assessment. N/A steps are skipped.
- Import modes:
  - **Update & add** matches rows by Month + Program + Topic + Audience for the tracker, and by person + session for attendance, assessments and surveys.
  - **Replace all** swaps the whole dataset for the file.
  - **Add all as new** appends every row.
- **Tasks** link to their topic by its internal id (`Topic ID`), so they survive edits to the topic's name or date. Import in Replace mode keeps the ids of matching topics.
- **Activity Log** records every add, update (old → new values), delete, clear, import and restore. Deletes keep a JSON copy in the `Snapshot` column so they can be restored. Copies over 45,000 characters are skipped because of the Sheets cell limit.
- **Deletes** need the person to type DELETE. Replacing data on import needs REPLACE.

