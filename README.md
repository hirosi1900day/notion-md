# Notion to Markdown Converter

This tool converts Notion pages into Markdown files. It also exports any databases within the page as separate markdown tables.

## Features

- Converts Notion pages to markdown format
- Exports databases as markdown tables
- Option to save databases as separate files
- Preserves page structure and formatting
- Handles nested content

## Prerequisites

- Node.js 14 or higher
- A Notion integration token
- Notion page ID that you want to export

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with the following content:

```
NOTION_TOKEN=your_integration_token_here
NOTION_PAGE_ID=your_page_id_here
```

## Getting a Notion Integration Token

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name and select the workspace
4. Copy the "Internal Integration Token"
5. In your Notion page, click "Share" and invite your integration

## Finding Your Notion Page ID

The Page ID is the part of the Notion URL after the workspace name and before any query parameters:

```
https://www.notion.so/workspace/page-title-c403a90be13c4cee987a7605efac48ad
                                                    |------- Page ID -------|
```

## Usage

Build and run the tool:

```bash
npm run build   # Build the TypeScript code
npm start       # Run the converter
```

Alternatively, you can use the development command:

```bash
npm run dev     # Build and run in one command
```

## Export Options

You can configure the export options in the `main()` function:

```typescript
const exportOptions = {
  separateDatabaseFiles: true,  // Save databases as separate files
  includeDbInPage: true         // Include database content in the page markdown
};
```

## Output

The converted files are saved in the `output/` directory:
- Main page as `notion_page_[PAGE_ID].md`
- Databases as `notion_database_[DATABASE_ID].md`

## Customization

You can modify the code to change:
- Output file format
- Database formatting
- Include/exclude specific content
- Handling of specific Notion blocks

## License

MIT