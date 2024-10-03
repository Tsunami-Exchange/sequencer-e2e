import { Cell } from '@ton/core';
import { MATCHER_URL } from '../utils/constants';
import { expect } from 'playwright/test';

type SequencerResponse = {
  ok: boolean;
};

export async function sendToSequencer(ext: Cell) {
  const response = await fetch(MATCHER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tx: ext.toBoc().toString('hex'), format: 'hex' }),
  });
  if (!response.ok) {
    const errorResult = (await response.json()) as { error: string };
    throw new Error(`Sending to sequencer failed: ${errorResult.error}`);
  }
  const json = (await response.json()) as SequencerResponse;
  console.log('sequencer response is', json);
  expect.soft(json.ok, 'Sequencer should have returned ok for sent transaction').toBeTruthy();
}
