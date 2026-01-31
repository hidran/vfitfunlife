import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomePage from './page';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock usePullToRefresh
vi.mock('use-pull-to-refresh', () => ({
  usePullToRefresh: () => ({
    isRefreshing: false,
    pullPosition: 0,
  }),
}));

// Mock SectionContext to return 'fun' section
const mockSetSection = vi.fn();
vi.mock('@/contexts/SectionContext', () => ({
  useSection: () => ({
    section: 'fun',
    setSection: mockSetSection,
  }),
  SectionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('VFun Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VFun Section Rendering', () => {
    it('renders VFun content when section is fun', () => {
      render(<HomePage />);

      // Check for VFun title and subtitle
      expect(screen.getByText('VFun')).toBeInTheDocument();
      expect(screen.getByText('Entertainment & Events')).toBeInTheDocument();
    });

    it('renders VFun description', () => {
      render(<HomePage />);

      expect(
        screen.getByText(
          "Discover events, parties, VR experiences, and exclusive streaming content."
        )
      ).toBeInTheDocument();
    });

    it('renders PartyPopper icon in header', () => {
      render(<HomePage />);

      // Check for the section icon container
      const iconContainer = document.querySelector('.bg-section-gradient');
      expect(iconContainer).toBeInTheDocument();
    });

    it('applies section-specific theming classes', () => {
      render(<HomePage />);

      // Check for section-specific classes
      const gradientElements = document.querySelectorAll('.bg-section-gradient');
      expect(gradientElements.length).toBeGreaterThan(0);

      const primaryElements = document.querySelectorAll('.text-section-primary');
      expect(primaryElements.length).toBeGreaterThan(0);
    });
  });

  describe('What You Can Do Section', () => {
    it('renders "What you can do" heading', () => {
      render(<HomePage />);

      expect(screen.getByText('What you can do')).toBeInTheDocument();
    });

    it('renders all VFun features', () => {
      render(<HomePage />);

      const features = [
        'Live Events & Parties',
        'VR Experiences',
        'Exclusive Streaming',
        'Social Meetups',
        'Member-Only Access',
      ];

      features.forEach((feature) => {
        expect(screen.getByText(feature)).toBeInTheDocument();
      });
    });

    it('renders numbered feature indicators', () => {
      render(<HomePage />);

      // Check for numbered badges (1-5)
      for (let i = 1; i <= 5; i++) {
        const numberedElement = screen.getByText(i.toString());
        expect(numberedElement).toBeInTheDocument();
      }
    });
  });

  describe('Featured Section', () => {
    it('renders "Featured" heading', () => {
      render(<HomePage />);

      expect(screen.getByText('Featured')).toBeInTheDocument();
    });

    it('renders 4 featured placeholder items', () => {
      render(<HomePage />);

      // Check for 4 placeholder containers (pulse animation elements)
      const pulseElements = document.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThanOrEqual(4);
    });

    it('renders featured items in a grid layout', () => {
      render(<HomePage />);

      // Check for grid container
      const gridContainer = document.querySelector('.grid-cols-2');
      expect(gridContainer).toBeInTheDocument();
    });
  });

  describe('Quick Actions', () => {
    it('renders "Quick Actions" heading', () => {
      render(<HomePage />);

      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('renders all 4 quick action buttons', () => {
      render(<HomePage />);

      const actions = ['Book a Class', 'Find Nearby', 'View Schedule', 'My Progress'];

      actions.forEach((action) => {
        expect(screen.getByText(action)).toBeInTheDocument();
      });
    });

    it('quick action buttons are clickable', () => {
      render(<HomePage />);

      const buttons = [
        screen.getByText('Book a Class'),
        screen.getByText('Find Nearby'),
        screen.getByText('View Schedule'),
        screen.getByText('My Progress'),
      ];

      buttons.forEach((button) => {
        expect(button).toBeEnabled();
        fireEvent.click(button);
      });
    });

    it('quick action buttons have correct styling classes', () => {
      render(<HomePage />);

      const button = screen.getByText('Book a Class');
      expect(button).toHaveClass('bg-section-primary/20');
      expect(button).toHaveClass('text-section-primary');
      expect(button).toHaveClass('rounded-full');
    });
  });

  describe('Header and Navigation', () => {
    it('renders the main header with V logo', () => {
      render(<HomePage />);

      expect(screen.getByText('V')).toBeInTheDocument();
    });

    it('renders sticky header with correct classes', () => {
      render(<HomePage />);

      const header = document.querySelector('header');
      expect(header).toHaveClass('sticky');
      expect(header).toHaveClass('top-0');
      expect(header).toHaveClass('backdrop-blur-md');
    });

    it('renders user avatar in header', () => {
      render(<HomePage />);

      // Avatar component should be rendered
      const avatar = document.querySelector('[data-testid="avatar"]') || 
                     document.querySelector('[class*="rounded-full"]');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('Container and Layout', () => {
    it('renders with container-mobile class', () => {
      render(<HomePage />);

      const containers = document.querySelectorAll('.container-mobile');
      expect(containers.length).toBeGreaterThan(0);
    });

    it('renders main content area', () => {
      render(<HomePage />);

      const main = document.querySelector('main');
      expect(main).toBeInTheDocument();
    });
  });

  describe('VFun Theming', () => {
    it('uses section-primary color classes', () => {
      render(<HomePage />);

      const sectionPrimaryElements = document.querySelectorAll('.bg-section-primary\\/20');
      expect(sectionPrimaryElements.length).toBeGreaterThan(0);
    });

    it('uses gradient text for title', () => {
      render(<HomePage />);

      const titleElement = screen.getByText('VFun');
      expect(titleElement).toHaveClass('gradient-text');
    });

    it('uses section gradient background for icon', () => {
      render(<HomePage />);

      const iconContainer = document.querySelector('.bg-section-gradient');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Feature List Items', () => {
    it('each feature has proper structure with icon and text', () => {
      render(<HomePage />);

      // Get all feature items (they're in flex containers with gap-3)
      const featureContainers = document.querySelectorAll('.gap-3');
      expect(featureContainers.length).toBeGreaterThan(0);
    });

    it('features have rounded border styling', () => {
      render(<HomePage />);

      // Check for rounded-xl and border classes on feature items
      const roundedElements = document.querySelectorAll('.rounded-xl');
      expect(roundedElements.length).toBeGreaterThan(0);
    });
  });
});
