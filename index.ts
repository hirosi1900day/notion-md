import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// 型定義
interface DatabaseItem {
  id: string;
  title: string;
  filePath: string;
  itemCount: number;
}

interface ExportOptions {
  separateDatabaseFiles?: boolean;
  includeDbInPage?: boolean;
}

interface ExportResult {
  pageFilePath: string;
  databaseFiles: DatabaseItem[];
}

interface DatabaseBlock {
  id: string;
  title: string;
}

interface DatabaseData {
  databaseInfo: any;
  items: any[];
}

// NotionのAPIクライアントを初期化
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// NotionToMarkdownインスタンスを初期化
const n2m = new NotionToMarkdown({ notionClient: notion });

// マークダウンを出力するディレクトリを確認・作成
const outputDir = path.join(__dirname, '..', 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

/**
 * データベースの内容を取得する関数
 * @param databaseId NotionのデータベースID
 * @returns データベースの内容
 */
async function fetchDatabaseContent(databaseId: string): Promise<DatabaseData> {
  try {
    // データベースの情報を取得
    const databaseInfo = await notion.databases.retrieve({ database_id: databaseId });
    // 型アサーションを使用してタイトルにアクセス
    const databaseTitle = (databaseInfo as any).title?.[0]?.plain_text || 'タイトルなし';
    console.log(`データベース名: ${databaseTitle}`);
    
    // すべてのアイテムを取得
    const allItems: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;
    
    // ページネーションを使用してすべてのアイテムを取得
    while (hasMore) {
      console.log(`データベースアイテムを取得中... ${allItems.length}件取得済み`);
      
      const response = await notion.databases.query({
        database_id: databaseId,
        page_size: 100, // 一度に最大100件取得
        start_cursor: nextCursor,
      });
      
      allItems.push(...response.results);
      hasMore = response.has_more;
      // next_cursorはstring | null | undefinedの可能性があるため、undefinedに統一
      nextCursor = response.next_cursor || undefined;
      
      // API制限を考慮して短い待機時間を設ける
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`データベースアイテム取得完了: 合計${allItems.length}件`);
    
    return {
      databaseInfo,
      items: allItems
    };
  } catch (error: any) {
    console.error(`データベース取得エラー: ${error.message}`);
    return { databaseInfo: {}, items: [] };
  }
}

/**
 * データベースの内容をマークダウンテーブルに変換する関数
 * @param database データベース情報とアイテム
 * @returns マークダウンテーブル
 */
function databaseToMarkdown(database: DatabaseData): string {
  if (!database || !database.items || database.items.length === 0) {
    return '### データベースのアイテムはありません';
  }

  try {
    const { databaseInfo, items } = database;
    
    // データベースのプロパティを取得
    const properties = databaseInfo.properties;
    const propertyKeys = Object.keys(properties);
    
    // マークダウンテーブルのヘッダーを作成
    const databaseTitle = (databaseInfo as any).title?.[0]?.plain_text || 'データベース';
    let markdown = `### ${databaseTitle}\n\n`;
    markdown += '| ';
    propertyKeys.forEach(key => {
      markdown += `${properties[key].name} | `;
    });
    markdown += '\n| ';
    propertyKeys.forEach(() => {
      markdown += '--- | ';
    });
    markdown += '\n';
    
    // アイテムの値を追加
    items.forEach(item => {
      markdown += '| ';
      propertyKeys.forEach(key => {
        const property = item.properties[properties[key].name];
        let value = '';
        
        // プロパティのタイプに応じて値を取得
        if (property.type === 'title' && property.title.length > 0) {
          value = property.title[0].plain_text;
        } else if (property.type === 'rich_text' && property.rich_text.length > 0) {
          value = property.rich_text[0].plain_text;
        } else if (property.type === 'number') {
          value = property.number !== null ? property.number.toString() : '';
        } else if (property.type === 'select' && property.select) {
          value = property.select.name || '';
        } else if (property.type === 'multi_select' && property.multi_select) {
          value = property.multi_select.map((sel: any) => sel.name).join(', ');
        } else if (property.type === 'date' && property.date) {
          value = property.date.start || '';
        } else if (property.type === 'checkbox') {
          value = property.checkbox ? '✅' : '❌';
        } else if (property.type === 'url') {
          value = property.url || '';
        }
        
        markdown += `${value} | `;
      });
      markdown += '\n';
    });
    
    return markdown;
  } catch (error: any) {
    console.error(`マークダウン変換エラー: ${error.message}`);
    return '### データベースの変換中にエラーが発生しました';
  }
}

/**
 * ページ内のデータベースブロックを探す関数
 * @param pageId NotionのページID
 * @returns データベースIDの配列
 */
async function findDatabasesInPage(pageId: string): Promise<DatabaseBlock[]> {
  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });
    
    const databaseBlocks = response.results.filter(
      block => (block as any).type === 'child_database'
    );
    
    return databaseBlocks.map(block => ({
      id: block.id,
      title: (block as any).child_database?.title || '名称なしデータベース'
    }));
  } catch (error: any) {
    console.error(`ページ内データベース検索エラー: ${error.message}`);
    return [];
  }
}

/**
 * データベースの内容を個別のマークダウンファイルとして保存する関数
 * @param databaseId データベースID
 * @param database データベース情報とアイテム
 * @param title データベースのタイトル
 * @returns 保存したファイルのパス
 */
async function saveDatabaseAsMarkdown(databaseId: string, database: DatabaseData, title: string): Promise<string | null> {
  try {
    // データベースをマークダウンテーブルに変換
    const markdown = databaseToMarkdown(database);
    
    // ファイル名を生成
    const fileName = `notion_database_${databaseId.replace(/-/g, '')}.md`;
    const filePath = path.join(outputDir, fileName);
    
    // ファイルヘッダーを作成
    const header = `# ${title || 'Notionデータベース'}\n\n`;
    const timestamp = new Date().toLocaleString('ja-JP');
    const footer = `\n\n---\n\n_このファイルは ${timestamp} に生成されました_\n`;
    
    // ファイルに書き込み
    fs.writeFileSync(filePath, header + markdown + footer);
    
    console.log(`データベースがマークダウンファイルとして保存されました: ${filePath}`);
    return filePath;
  } catch (error: any) {
    console.error(`データベースの保存中にエラーが発生しました: ${error.message}`);
    return null;
  }
}

/**
 * Notionページをマークダウンとしてエクスポートする関数
 * @param pageId NotionのページID
 * @param options エクスポートオプション
 */
async function convertNotionToMarkdown(pageId: string, options: ExportOptions = {}): Promise<ExportResult> {
  try {
    const {
      separateDatabaseFiles = true, // データベースを個別ファイルとして保存するかどうか
      includeDbInPage = true        // ページのマークダウンにデータベースを含めるかどうか
    } = options;
    
    // ページの情報を取得
    const pageInfo = await notion.pages.retrieve({ page_id: pageId });
    // 型アサーションを使用してタイトルにアクセス
    const pageTitle = (pageInfo as any).properties?.title?.title?.[0]?.plain_text || 'タイトルなし';
    console.log(`ページタイトル: ${pageTitle}`);
    
    // マークダウンブロックを取得
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    
    // マークダウンに変換
    const markdown = n2m.toMarkdownString(mdBlocks);
    
    // "child_database"というテキストを除外
    let cleanedMarkdown = markdown.parent.replace(/child_database(\s*)/g, '');
    
    // ページ内のデータベースを探索
    const databases = await findDatabasesInPage(pageId);
    console.log(`見つかったデータベース数: ${databases.length}`);
    
    let databaseContent = '';
    const savedDbFiles: DatabaseItem[] = [];
    
    // 各データベースの内容を取得してマークダウンに変換
    if (databases.length > 0) {
      if (includeDbInPage) {
        databaseContent = '\n\n## ページ内のデータベース\n\n';
      }
      
      for (const db of databases) {
        console.log(`データベース処理中: ${db.title}`);
        const dbData = await fetchDatabaseContent(db.id);
        
        // 個別ファイルとして保存
        if (separateDatabaseFiles) {
          const dbFilePath = await saveDatabaseAsMarkdown(
            db.id, 
            dbData, 
            `${pageTitle} - ${db.title}`
          );
          if (dbFilePath) {
            savedDbFiles.push({
              id: db.id,
              title: db.title,
              filePath: dbFilePath,
              itemCount: dbData.items.length
            });
          }
        }
        
        // ページのマークダウンに含める
        if (includeDbInPage) {
          const dbMarkdown = databaseToMarkdown(dbData);
          databaseContent += dbMarkdown + '\n\n---\n\n';
        }
      }
    }
    
    // ファイル名を決定（ページIDを使用）
    const fileName = `notion_page_${pageId.replace(/-/g, '')}.md`;
    const filePath = path.join(outputDir, fileName);
    
    // 修正したマークダウンとデータベース内容を合わせて書き込み
    let pageContent = cleanedMarkdown;
    
    if (includeDbInPage && databaseContent) {
      pageContent += databaseContent;
    }
    
    // データベースを個別に保存した場合、そのリンクを追加
    if (separateDatabaseFiles && savedDbFiles.length > 0) {
      let dbLinks = '\n\n## データベースファイル\n\n';
      dbLinks += 'このページに含まれるデータベースは、以下の個別ファイルにエクスポートされています：\n\n';
      
      savedDbFiles.forEach(db => {
        const relativePath = path.relative(path.dirname(filePath), db.filePath);
        dbLinks += `- [${db.title || 'データベース'} (${db.itemCount}アイテム)](${relativePath})\n`;
      });
      
      pageContent += dbLinks;
    }
    
    // タイムスタンプを追加
    const timestamp = new Date().toLocaleString('ja-JP');
    pageContent += `\n\n---\n\n_このファイルは ${timestamp} に生成されました_\n`;
    
    fs.writeFileSync(filePath, pageContent);
    
    console.log(`マークダウンファイルが作成されました: ${filePath}`);
    return {
      pageFilePath: filePath,
      databaseFiles: savedDbFiles
    };
  } catch (error: any) {
    console.error('エラーが発生しました:', error);
    throw error;
  }
}

// メイン処理
async function main(): Promise<void> {
  const pageId = process.env.NOTION_PAGE_ID;
  
  if (!pageId) {
    console.error('NOTION_PAGE_IDが設定されていません。.envファイルを確認してください。');
    process.exit(1);
  }
  
  try {
    // オプションを指定してエクスポート
    const exportOptions: ExportOptions = {
      separateDatabaseFiles: true,  // データベースを個別ファイルとして保存
      includeDbInPage: true         // ページのマークダウンにもデータベースを含める
    };
    
    const result = await convertNotionToMarkdown(pageId, exportOptions);
    console.log('変換が完了しました！');
    
    // 変換されたページファイルの内容を表示
    const content = fs.readFileSync(result.pageFilePath, 'utf-8');
    console.log('------------マークダウンの内容--------------');
    console.log(content.substring(0, 500) + (content.length > 500 ? '...(省略)' : ''));
    console.log('------------------------------------------');
    
    // データベースファイルがある場合は情報を表示
    if (result.databaseFiles && result.databaseFiles.length > 0) {
      console.log(`\n生成されたデータベースファイル (${result.databaseFiles.length}件):`);
      result.databaseFiles.forEach(db => {
        console.log(`- ${db.title || 'データベース'}: ${db.filePath} (${db.itemCount}アイテム)`);
      });
    }
  } catch (error: any) {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプトを実行
main();