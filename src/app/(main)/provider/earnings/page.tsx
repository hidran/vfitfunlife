'use client';

import { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, DollarSign, Download, ArrowUpRight, Clock, CheckCircle } from 'lucide-react';
import { EarningsChart } from '@/components/provider/EarningsChart';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/stores/providerStore';
import { useI18n } from '@/hooks/useI18n';
import { toLocaleTag } from '@/types/locale';
import { EarningsFilters } from '@/types/provider';
import { cn } from '@/lib/utils';
import { Transaction } from '@/types/provider';

// Helper function to generate chart data from actual transactions
function generateChartDataFromTransactions(transactions: Transaction[]) {
  const data: Record<string, { earnings: number; bookings: number }> = {};
  
  // Initialize last 30 days with zeros
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    data[dateStr] = { earnings: 0, bookings: 0 };
  }
  
  // Fill in actual transaction data
  transactions.forEach(t => {
    // Handle both Firestore Timestamp and Date
    const createdAt = t.createdAt && typeof t.createdAt === 'object' && 'toDate' in t.createdAt 
      ? t.createdAt.toDate() 
      : new Date(t.createdAt);
    const date = createdAt.toISOString().split('T')[0];
    if (data[date] && t.type === 'booking_payment' && t.status === 'completed') {
      data[date].earnings += t.amount;
      data[date].bookings += 1;
    }
  });
  
  return Object.entries(data).map(([date, values]) => ({
    date,
    earnings: values.earnings,
    bookings: values.bookings,
  }));
}

// Helper function to generate empty chart data
function generateEmptyChartData() {
  const data = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      earnings: 0,
      bookings: 0,
    });
  }
  return data;
}

export default function ProviderEarningsPage() {
  const { t, locale } = useI18n();
  const { earnings, isLoadingEarnings, fetchEarnings, requestWithdrawal } = useProviderStore();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  // Use real data from Firestore
  const earningsData = earnings || {
    availableBalance: 0,
    pendingAmount: 0,
    monthTotal: 0,
    yearTotal: 0,
    lifetimeTotal: 0,
    transactions: [],
  };

  // Generate chart data from actual transactions or show empty state
  const chartData = earnings?.transactions?.length 
    ? generateChartDataFromTransactions(earnings.transactions)
    : generateEmptyChartData();

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (amount > 0 && amount <= earningsData.availableBalance) {
      await requestWithdrawal(amount);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
    }
  };

  const formatDate = (date: Date | { toDate(): Date }) => {
    const d = typeof date === 'object' && 'toDate' in date ? date.toDate() : date;
    return new Date(d).toLocaleDateString(toLocaleTag(locale));
  };

  const handleExport = () => {
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Status'];
    const rows = earningsData.transactions.map(t => [
      formatDate(t.createdAt),
      t.type,
      t.description,
      t.amount,
      t.status,
    ]);
    
    const csv = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">{t('provider.earnings.title')}</h1>
          <p className="text-gray-400 mt-1">
            {t('provider.earnings.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2" />
            {t('provider.earnings.btn.export')}
          </Button>
          <Button onClick={() => setShowWithdrawModal(true)}>
            <ArrowUpRight className="w-4 h-4 mr-2" />
            {t('provider.earnings.btn.withdraw')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#2A2D3A] rounded-xl p-6 border border-hairline">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Wallet className="w-6 h-6 text-green-400" />
            </div>
            <span className="text-xs text-green-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {t('provider.earnings.stat.available')}
            </span>
          </div>
          <p className="text-3xl font-bold text-content">
            €{earningsData.availableBalance.toFixed(2)}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t('provider.earnings.stat.availableLabel')}</p>
        </div>

        <div className="bg-[#2A2D3A] rounded-xl p-6 border border-hairline">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-500/20 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
            <span className="text-xs text-yellow-400 flex items-center gap-1">
              {t('provider.earnings.stat.pending')}
            </span>
          </div>
          <p className="text-3xl font-bold text-content">
            €{earningsData.pendingAmount.toFixed(2)}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t('provider.earnings.stat.pendingLabel')}</p>
        </div>

        <div className="bg-[#2A2D3A] rounded-xl p-6 border border-hairline">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-400" />
            </div>
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12%
            </span>
          </div>
          <p className="text-3xl font-bold text-content">
            €{earningsData.monthTotal.toFixed(2)}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t('provider.earnings.stat.thisMonth')}</p>
        </div>

        <div className="bg-[#2A2D3A] rounded-xl p-6 border border-hairline">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <CheckCircle className="w-6 h-6 text-purple-400" />
            </div>
            <span className="text-xs text-purple-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +8%
            </span>
          </div>
          <p className="text-3xl font-bold text-content">
            €{earningsData.yearTotal.toFixed(2)}
          </p>
          <p className="text-sm text-gray-400 mt-1">{t('provider.earnings.stat.thisYear')}</p>
        </div>
      </div>

      {/* Chart */}
      <EarningsChart data={chartData} />

      {/* Transactions */}
      <div className="bg-[#2A2D3A] rounded-xl border border-hairline overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-hairline">
          <h2 className="text-lg font-semibold text-content">{t('provider.earnings.transactions.title')}</h2>
          <div className="flex items-center gap-2">
            <select className="bg-[#1A1D29] border border-hairline rounded-lg px-3 py-2 text-sm text-content outline-none">
              <option value="all">{t('provider.earnings.transactions.filter.all')}</option>
              <option value="booking_payment">{t('provider.earnings.transactions.filter.booking')}</option>
              <option value="withdrawal">{t('provider.earnings.transactions.filter.withdrawal')}</option>
              <option value="refund">{t('provider.earnings.transactions.filter.refund')}</option>
            </select>
          </div>
        </div>

        {earningsData.transactions.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-content mb-2">{t('provider.earnings.transactions.empty.title')}</h3>
            <p className="text-gray-400">{t('provider.earnings.transactions.empty.subtitle')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline bg-[#1A1D29]/50">
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">{t('provider.earnings.table.date')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">{t('provider.earnings.table.type')}</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">{t('provider.earnings.table.description')}</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-400">{t('provider.earnings.table.amount')}</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-400">{t('provider.earnings.table.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {earningsData.transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-[#1A1D29]/30">
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {formatDate(transaction.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'text-xs font-medium px-2 py-1 rounded-full',
                        transaction.type === 'booking_payment' && 'bg-green-500/20 text-green-400',
                        transaction.type === 'withdrawal' && 'bg-blue-500/20 text-blue-400',
                        transaction.type === 'refund' && 'bg-red-500/20 text-red-400',
                      )}>
                        {transaction.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-content">
                      {transaction.description}
                    </td>
                    <td className={cn(
                      'px-6 py-4 text-sm text-right font-medium',
                      transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                    )}>
                      {transaction.amount > 0 ? '+' : ''}€{transaction.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        'text-xs',
                        transaction.status === 'completed' ? 'text-green-400' :
                        transaction.status === 'pending' ? 'text-yellow-400' :
                        'text-gray-400'
                      )}>
                        {transaction.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2A2D3A] rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-content mb-4">{t('provider.earnings.withdraw.title')}</h3>

            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-2">{t('provider.earnings.withdraw.availableBalance')}</p>
              <p className="text-2xl font-bold text-content">
                €{earningsData.availableBalance.toFixed(2)}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">{t('provider.earnings.withdraw.amountLabel')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  max={earningsData.availableBalance}
                  className="w-full bg-[#1A1D29] border border-hairline rounded-lg pl-8 pr-4 py-3 text-content placeholder-gray-500 outline-none focus:border-section-primary"
                />
              </div>
              <button
                onClick={() => setWithdrawAmount(earningsData.availableBalance.toString())}
                className="text-sm text-section-primary mt-2 hover:underline"
              >
                {t('provider.earnings.withdraw.withdrawAll')}
              </button>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleWithdraw}
                disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > earningsData.availableBalance}
                fullWidth
              >
                {t('provider.earnings.withdraw.submit')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowWithdrawModal(false)}
              >
                {t('provider.earnings.withdraw.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
