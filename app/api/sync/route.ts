import { NextResponse } from 'next/server';
import { pool } from '@/app/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  try {
    const client = await pool.connect();
    try {
      let query = 'SELECT * FROM articles';
      const params: any[] = [];

      if (projectId) {
        query += ' WHERE project_id = $1';
        params.push(projectId);
      }

      query += ' ORDER BY created_at ASC';
      const res = await client.query(query, params);
      return NextResponse.json({ articles: res.rows });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;
    const client = await pool.connect();

    try {
      if (action === 'BULK_INSERT_ARTICLES') {
        const { articles, projectId } = payload;
        for (const art of articles) {
          await client.query(
            `INSERT INTO articles (id, project_id, title, authors, year, abstract, doi, full_text_content)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id, project_id) DO NOTHING`,
            [
              art.id,
              projectId || 'PRJ-DEFAULT',
              art.title,
              art.authors || [],
              art.year || '',
              art.abstract || '',
              art.doi || '',
              art.fullTextContent || '',
            ]
          );
        }
      }

      if (action === 'VOTE_SCREENING') {
        const { articleId, projectId, reviewerId, decision } = payload;
        await client.query(
          `UPDATE articles 
           SET screening_decisions = jsonb_set(COALESCE(screening_decisions, '{}'::jsonb), ARRAY[$1], to_jsonb($2::text))
           WHERE id = $3 AND project_id = $4`,
          [reviewerId, decision, articleId, projectId || 'PRJ-DEFAULT']
        );
      }

      return NextResponse.json({ success: true });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}