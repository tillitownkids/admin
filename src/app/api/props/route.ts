import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { errorText, linkPropToEpisode, storeGeneratedPropSheet } from '@/lib/props';
import { recordGeneratedImageVersion } from '@/lib/generatedImageHistory';
import { episodeTitle } from '@/lib/episodeSteps';
import { isPropKind } from '@/lib/propSheet';

// Objects (vehicles, bags, tents...) are stored as props. See src/lib/propSheet.ts.

/** Every object, with the title of the episode an episode object belongs to, and the episodes to choose from. */
export async function GET() {
  const [props, stories] = await Promise.all([
    supabase.from('Prop').select('*').order('created_at', { ascending: false }),
    supabase.from('Story').select('id, topic, content').order('generated_at', { ascending: false }),
  ]);
  if (props.error || stories.error) {
    const error = props.error || stories.error;
    console.error('Error fetching objects:', error);
    return NextResponse.json({ error: error?.message || 'The objects could not be loaded.' }, { status: 500 });
  }

  const episodes = (stories.data || []).map((story) => ({ id: story.id as string, title: episodeTitle(story) }));
  const titles = new Map(episodes.map((episode) => [episode.id, episode.title]));
  return NextResponse.json({
    props: (props.data || []).map((prop) => ({ ...prop, episode_title: prop.story_id ? titles.get(prop.story_id) ?? null : null })),
    episodes,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const kind = body.kind ?? 'permanent';
    const storyId = typeof body.story_id === 'string' && body.story_id ? body.story_id : null;

    if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 });
    if (!isPropKind(kind)) return NextResponse.json({ error: 'Choose permanent or this episode only.' }, { status: 400 });
    if (kind === 'episode' && !storyId) return NextResponse.json({ error: 'Choose the episode this object belongs to.' }, { status: 400 });

    const stored = await storeGeneratedPropSheet(body.generated_image_url, body.magnific_identifier);
    const payload: Record<string, unknown> = {
      name,
      description: typeof body.description === 'string' ? body.description : '',
      kind,
      story_id: kind === 'episode' ? storyId : null,
    };
    if (body.reference_image_url !== undefined) payload.reference_image_url = body.reference_image_url;
    if (body.magnific_identifier !== undefined) payload.magnific_identifier = body.magnific_identifier;
    if (stored) payload.generated_image_url = stored.publicUrl;

    const { data: prop, error } = await supabase.from('Prop').insert([payload]).select().single();
    if (error) throw error;
    if (prop.story_id) await linkPropToEpisode(prop.id, prop.story_id);

    if (stored) {
      await recordGeneratedImageVersion({
        ownerType: 'prop_generated',
        ownerId: prop.id,
        publicUrl: stored.publicUrl,
        storagePath: stored.storagePath,
        storageBucket: stored.storageBucket,
        providerIdentifier: body.magnific_identifier ?? null,
        promptUsed: prop.description,
      });
    }
    return NextResponse.json({ prop });
  } catch (error) {
    console.error('Error creating object:', error);
    return NextResponse.json({ error: errorText(error, 'The object could not be created.') }, { status: 500 });
  }
}
