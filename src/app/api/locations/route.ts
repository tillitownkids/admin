import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    let locations;
    try {
      locations = await prisma.location.findMany({
        orderBy: { created_at: 'desc' }
      });
    } catch {
      const { data, error } = await supabase
        .from('Location')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      locations = data;
    }
    return NextResponse.json({ locations });
  } catch (error: any) {
    console.error("Error fetching locations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    let location;
    try {
      location = await prisma.location.create({
        data: {
          name,
          description: description || '',
        }
      });
    } catch (prismaErr) {
      console.warn("Prisma location creation failed, falling back to Supabase:", prismaErr);
      const { data, error } = await supabase
        .from('Location')
        .insert([{
          name,
          description: description || '',
        }])
        .select()
        .single();

      if (error) throw error;
      location = data;
    }

    return NextResponse.json({ location });
  } catch (error: any) {
    console.error("Error creating location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
