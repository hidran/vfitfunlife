'use client';

import { useRouter } from 'next/navigation';
import {
  User,
  MapPin,
  CreditCard,
  Bell,
  HelpCircle,
  Settings,
  LogOut,
  ChevronRight,
  Star,
  Gift,
  Crown
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const menuItems = [
  {
    section: 'Account',
    items: [
      { icon: User, label: 'Dati personali', href: '/profile/edit' },
      { icon: MapPin, label: 'I miei indirizzi', href: '/profile/addresses' },
      { icon: CreditCard, label: 'Metodi di pagamento', href: '/profile/payment' },
    ],
  },
  {
    section: 'Preferenze',
    items: [
      { icon: Bell, label: 'Notifiche', href: '/profile/notifications' },
      { icon: Settings, label: 'Impostazioni', href: '/profile/settings' },
    ],
  },
  {
    section: 'Supporto',
    items: [
      { icon: HelpCircle, label: 'Centro assistenza', href: '/help' },
      { icon: Star, label: 'Valuta l\'app', href: '#' },
    ],
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, firebaseUser, logout, isLoading } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  // Get user display info
  const displayName = user?.fullName || firebaseUser?.displayName || 'Utente';
  const contactInfo = user?.phone || user?.email || firebaseUser?.phoneNumber || firebaseUser?.email || '';
  const pointsBalance = user?.pointsBalance || 0;
  const isVip = user?.isVip || false;

  return (
    <div className="min-h-screen bg-background-dark pb-20">
      {/* Profile Header */}
      <div className="p-4 pt-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-vfit-primary via-vfun-primary to-vlife-primary p-0.5">
            <div className="w-full h-full rounded-full bg-background-dark flex items-center justify-center overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-text-tertiary" />
              )}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-display font-bold text-text-inverse">
                {displayName}
              </h1>
              {isVip && (
                <span className="px-2 py-0.5 bg-vip-gold/20 text-vip-gold text-xs font-medium rounded-full">
                  VIP
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary">
              {contactInfo || 'Completa il profilo'}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-background-secondary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-text-inverse">0</p>
            <p className="text-xs text-text-tertiary">Prenotazioni</p>
          </div>
          <div className="bg-background-secondary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-vip-gold">{pointsBalance}</p>
            <p className="text-xs text-text-tertiary">Punti</p>
          </div>
          <div className="bg-background-secondary/10 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-text-inverse">0</p>
            <p className="text-xs text-text-tertiary">Recensioni</p>
          </div>
        </div>

        {/* VIP Banner */}
        <button className="w-full bg-gradient-to-r from-vip-gold/20 to-vip-gold/5 border border-vip-gold/30 rounded-xl p-4 flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-vip-gold/20 flex items-center justify-center">
            <Crown className="w-6 h-6 text-vip-gold" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-vip-gold">
              {isVip ? 'Sei VIP!' : 'Diventa VIP'}
            </h3>
            <p className="text-sm text-text-secondary">
              {isVip ? 'Goditi i vantaggi esclusivi' : 'Sconti esclusivi e vantaggi'}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-vip-gold" />
        </button>

        {/* Referral Banner */}
        <button className="w-full bg-gradient-to-r from-vfit-primary/20 to-vfun-primary/20 border border-vfit-primary/30 rounded-xl p-4 flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-vfit-primary/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-vfit-primary" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-semibold text-text-inverse">Invita un amico</h3>
            <p className="text-sm text-text-secondary">Guadagna 50 punti per ogni invito</p>
          </div>
          <ChevronRight className="w-5 h-5 text-text-tertiary" />
        </button>
      </div>

      {/* Menu Sections */}
      <div className="px-4 space-y-6">
        {menuItems.map((section) => (
          <div key={section.section}>
            <h3 className="text-sm font-medium text-text-tertiary mb-2 px-1">
              {section.section}
            </h3>
            <div className="bg-background-secondary/5 rounded-xl overflow-hidden">
              {section.items.map((item, index) => (
                <button
                  key={item.label}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 text-left hover:bg-background-secondary/10 transition-colors',
                    index !== section.items.length - 1 && 'border-b border-border/10'
                  )}
                >
                  <item.icon className="w-5 h-5 text-text-secondary" />
                  <span className="flex-1 text-text-inverse">{item.label}</span>
                  <ChevronRight className="w-5 h-5 text-text-tertiary" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={isLoading}
          className="w-full flex items-center gap-4 p-4 text-left text-error hover:bg-error/10 rounded-xl transition-colors disabled:opacity-50"
        >
          <LogOut className="w-5 h-5" />
          <span>{isLoading ? 'Uscita...' : 'Esci'}</span>
        </button>
      </div>

      {/* App Version */}
      <p className="text-center text-xs text-text-tertiary mt-8 pb-4">
        V Fitness v1.0.0
      </p>
    </div>
  );
}
