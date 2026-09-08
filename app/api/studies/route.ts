import { NextResponse } from 'next/server';
import { pool } from '@/app/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get('email');

  if (!userEmail) {
    return NextResponse.json({ error: 'E-mail não informado' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const query = `
      SELECT 
        p.id, 
        p.title, 
        p.description, 
        p.created_at,
        p.owner_email,
        CASE 
          WHEN p.owner_email = $1 THEN 'PROPRIETÁRIO'
          ELSE COALESCE(pm.role, 'MEMBRO')
        END as user_role,
        (SELECT COUNT(*) FROM articles a WHERE a.project_id = p.id) as total_articles
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_email = $1
      WHERE p.owner_email = $1 OR pm.user_email = $1
      ORDER BY p.created_at DESC
    `;

    const res = await client.query(query, [userEmail.toLowerCase().trim()]);
    return NextResponse.json({ studies: res.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { action, payload } = body;
  const client = await pool.connect();

  try {
    if (action === 'CREATE_STUDY') {
      const { title, description, ownerEmail } = payload;
      const studyId = `std-${Date.now()}`;

      await client.query(
        `INSERT INTO projects (id, title, description, owner_email)
         VALUES ($1, $2, $3, $4)`,
        [studyId, title, description || '', ownerEmail.toLowerCase().trim()]
      );

      return NextResponse.json({ success: true, studyId });
    }

    if (action === 'SHARE_STUDY') {
      const { studyId, targetEmail, roles } = payload;

      // Converte o array de papéis (ex: ['SCREENER', 'CODER']) em uma string unificada (ex: 'SCREENER,CODER')
      const rolesString = Array.isArray(roles) ? roles.join(',') : (roles || 'SCREENER');

      await client.query(
        `INSERT INTO project_members (project_id, user_email, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, user_email) DO UPDATE SET role = $3`,
        [studyId, targetEmail.toLowerCase().trim(), rolesString]
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação não reconhecida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}