import React from 'react';
import {createRoot} from 'react-dom/client';
import BankRewards from './pages/bank-rewards/BankRewards';
import {loadRecords, profile} from './services/recordStore';
import './window.css';

const root = createRoot(document.getElementById('root')!);
loadRecords().then(() => root.render(<BankRewards user={profile} />)).catch(error => {
  root.render(<section role="alert"><h1>无法打开银行记录</h1><p>{String(error.message || error)}</p>
    <p>请检查本机数据文件后重新打开金羊毛。原文件已保留。</p></section>);
});
