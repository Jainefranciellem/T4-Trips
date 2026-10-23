import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/common/Logo';
import { roleLabel } from '@/lib/constants';
import type { Permission } from '@/types';
import { BedDouble, Bus, Calculator, Map, Users, UserCog, LogOut, Menu, X } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const navItems: { path: string; icon: typeof Map; label: string; permission: Permission }[] = [
  { path: '/viagens', icon: Map, label: 'Minhas Trips', permission: 'trips.read' },
  { path: '/clientes', icon: Users, label: 'Clientes', permission: 'customers.read' },
  { path: '/veiculos', icon: Bus, label: 'Veículos', permission: 'vehicles.manage' },
  { path: '/pousadas', icon: BedDouble, label: 'Pousadas', permission: 'accommodations.manage' },
  { path: '/simulador', icon: Calculator, label: 'Simulador', permission: 'finance.read' },
  { path: '/usuarios', icon: UserCog, label: 'Usuários', permission: 'users.manage' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const { user, logout, can } = useAuth();

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden" onClick={onToggle} />
      )}

      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 lg:hidden"
        onClick={onToggle}
        aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <aside
        className={cn(
          'fixed left-0 top-0 h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-50 transition-transform duration-300 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-sidebar-border text-white">
            <Logo />
          </div>

          <nav className="flex-1 p-4 space-y-1" aria-label="Menu principal">
            {navItems
              .filter((item) => can(item.permission))
              .map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => window.innerWidth < 1024 && onToggle()}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
          </nav>

          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-sidebar-accent">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-[hsl(var(--sidebar-brand-text))] font-semibold">{user?.name?.charAt(0) || 'U'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-sidebar-foreground/70 truncate">{user && roleLabel[user.role]}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={logout}
                className="text-sidebar-foreground hover:text-destructive hover:bg-transparent"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
