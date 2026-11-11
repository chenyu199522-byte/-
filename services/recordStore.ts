import type {RewardState} from './bank-rewards/types';
import {validateState} from './bank-rewards/logic';

declare global {
  interface Window {
    katanos?: {exportBankRewardsCsv(text: string, name: string): Promise<{canceled: boolean}>};
    goldenFleece: {
      aiConnect(value:{key?:string;providerId?:string;model?:string}):Promise<{config:import('./ai').AIConfig;model:string}>;
      aiModels(id:string):Promise<string[]>;
      aiRead(): Promise<import('./ai').AIConfig>;
      aiSave(value: unknown): Promise<import('./ai').AIConfig>;
      aiRemove(id: string): Promise<import('./ai').AIConfig>;
      aiRun(value: import('./ai').AIRequest): Promise<import('./ai').AIResult>;
      aiCancel(): Promise<void>;
      selectImages(): Promise<import('./bank-rewards/types').EvidenceImage[]>;
      discardImages(ids: string[]): Promise<void>;
      imagePreview(id: string, full: boolean): Promise<string>;
      imageExport(id: string, name: string): Promise<{canceled:boolean}>;
      previewName(name: string): Promise<void>;
      previewScale(enabled: boolean, scale: number): Promise<void>;
      readLayout(): Promise<unknown>;
      saveLayout(layout: import('./layout').Layout): Promise<void>;
      read(): Promise<{state: RewardState | null; revision: string | null}>;
      save(state: RewardState, revision: string | null): Promise<string>;
    };
  }
}
export const profile = {id: 'local', username: '本机', language: 'zh', currency: 'USD'};
let current: RewardState | null = null;
let revision: string | null = null;
let testState: RewardState | null = null;
// Unit-test injection only; production UI has no test-state entry point.
export function setTestState(state: RewardState | null) {
  if (state) validateState(state);
  testState = state ? structuredClone(state) : null;
}

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
    read: () => testState ?? current,
    async commit(state: RewardState) {
      if (testState) { testState = structuredClone(state); return; }
      revision = await window.goldenFleece.save(state, revision);
      current = state;
    },
};
