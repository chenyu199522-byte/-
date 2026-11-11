import AIAssistant from './AIAssistant';
import type {RewardState} from '../../services/bank-rewards/types';
import React from 'react';
import {ExternalLink} from 'lucide-react';
export const ddSites = [
  ['NextBonus','https://dd.nextbonus.app/bonuses'],
  ['BankRewards','https://bankrewards.io/'],
  ['BankBonus','https://bankbonus.com/'],
  ['BonusHQ','https://bonushq.io/bonuses'],
  ['Churnables','https://churnables.com/banks'],
  ['Doctor of Credit · 银行奖励','https://www.doctorofcredit.com/best-bank-account-bonuses/'],
  ['BonusClerk','https://bonusclerk.com/'],
  ['BonusChurn','https://www.bonuschurn.com/'],
  ['SuperChurn','https://superchurn.com/'],
];
export const guideSites = [
  ['美卡论坛','https://www.uscardforum.com/'],
  ['美国信用卡指南','https://www.uscreditcardguide.com/zh/'],
  ['Doctor of Credit · 英文','https://www.doctorofcredit.com/'],
];
export default function ReferenceSites({kind,state}:{kind:'dd'|'guides';state:RewardState}) {
  const sites=kind==='dd'?ddSites:guideSites;
  return <section className="br-reference-panel">
    {kind==='dd'&&<AIAssistant kind="dd" state={state}/>}
    <h2>{kind==='dd'?'DD条件检测':'论坛与指南'}</h2>
    <p className="br-hint">{kind==='dd'?'查阅银行奖励条款、DD 条件与用户经验。点击网站后在默认浏览器中打开。':'阅读信用卡、银行账户与开户奖励的讨论和指南。'}</p>
    <div className="br-reference-grid">{sites.map(([name,url])=><a href={url} target="_blank" rel="noreferrer" key={url}>
      <span><strong>{name}</strong><small>{new URL(url).hostname}</small></span><ExternalLink size={20}/>
    </a>)}</div>
  </section>;
}
