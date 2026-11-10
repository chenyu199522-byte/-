import type {RewardState} from './bank-rewards/types';
import {validateState} from './bank-rewards/logic';

declare global {
  interface Window {
    katanos?: {exportBankRewardsCsv(text: string, name: string): Promise<{canceled: boolean}>};
    goldenFleece: {
      read(): Promise<{state: RewardState | null; revision: string | null}>;
      save(state: RewardState, revision: string | null): Promise<string>;
    };
  }
}
export const profile = {id: 'local', username: '本机', language: 'zh', currency: 'USD'};
let current: RewardState | null = null;
let revision: string | null = null;

export async function loadRecords() {
  const snapshot = await window.goldenFleece.read();
  if (snapshot.state !== null) {
    validateState(snapshot.state);
    if (snapshot.state.userId !== profile.id) throw new Error('记录归属与本机档案不符。');
  }
  current = snapshot.state;
  revision = snapshot.revision;
}

// The shared reward repository serializes commits and clones records on read.
export const rewardStore = {
    read: () => current,
    async commit(state: RewardState) {
      revision = await window.goldenFleece.save(state, revision);
      current = state;
    },
};
