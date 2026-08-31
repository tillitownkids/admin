'use server';

export async function logPayloadAction(label: string, payload: any) {
  console.log(`\n=================== [WEBHOOK PAYLOAD LOG: ${label}] ===================`);
  console.log(JSON.stringify(payload, null, 2));
  console.log(`========================================================================\n`);
  return { success: true };
}
