import { NextResponse } from 'next/server';
import { supabase } from '@/app/supabaseClient';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const { data: projectData, error: projError } = await supabase
    .from('projects')
    .select('current_step, coded_segments')
    .eq('id', projectId)
    .single();

  if (projError) {
    return NextResponse.json({ error: projError.message }, { status: 400 });
  }

  const { data: articles, error: artError } = await supabase
    .from('articles')
    .select('*')
    .eq('project_id', projectId);

  if (artError) {
    return NextResponse.json({ error: artError.message }, { status: 400 });
  }

  return NextResponse.json({
    currentStep: projectData?.current_step || 1,
    codedSegments: projectData?.coded_segments || [],
    articles,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, payload } = body;

  if (action === 'SAVE_PROGRESS') {
    const { projectId, currentStep, codedSegments } = payload;
    const { error } = await supabase
      .from('projects')
      .update({
        current_step: currentStep,
        coded_segments: codedSegments,
      })
      .eq('id', projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'BULK_INSERT_ARTICLES') {
    const { articles, projectId } = payload;
    if (!articles || !projectId) {
      return NextResponse.json({ error: 'Missing articles or projectId' }, { status: 400 });
    }

    const rowsToInsert = articles.map((a: any) => ({
      id: a.id,
      project_id: projectId,
      title: a.title,
      authors: a.authors,
      year: a.year,
      abstract: a.abstract,
      doi: a.doi,
      screening_decisions: a.screeningDecisions || {},
      full_text_decisions: a.fullTextDecisions || {},
      full_text_content: a.fullTextContent || '',
    }));

    const { error } = await supabase
      .from('articles')
      .upsert(rowsToInsert, { onConflict: 'id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'VOTE_SCREENING') {
    const { articleId, reviewerId, decision } = payload;
    const { data: art, error: fetchError } = await supabase
      .from('articles')
      .select('screening_decisions')
      .eq('id', articleId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    const currentDecisions = art?.screening_decisions || {};
    currentDecisions[reviewerId] = decision;

    const { error: updateError } = await supabase
      .from('articles')
      .update({ screening_decisions: currentDecisions })
      .eq('id', articleId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}