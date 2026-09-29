import { corsHeaders, jsonResponse, verifyAndRecordPayment } from '../_shared/paystack.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
  try {
    const input = await request.json();
    const reference = typeof input.reference === 'string' ? input.reference.trim() : '';
    if (!reference || reference.length > 100) return jsonResponse({ error: 'Paystack reference is invalid.' }, 400);
    const result = await verifyAndRecordPayment(reference);
    return jsonResponse(result, result.success ? 200 : 402);
  } catch (error) {
    console.error('Paystack verification error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Payment verification failed.' }, 500);
  }
});
