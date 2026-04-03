import React, { useState, useRef, useLayoutEffect, cloneElement } from 'react';

// --- Internal Types and Defaults ---

const DefaultHomeIcon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
const DefaultCompassIcon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" /></svg>;
const DefaultBellIcon = (props: React.SVGProps<SVGSVGElement>) => <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

export type NavItem = {
  id: string | number;
  icon: React.ReactElement;
  label?: string;
  onClick?: () => void;
};

const defaultNavItems: NavItem[] = [
  { id: 'default-home', icon: <DefaultHomeIcon />, label: 'Home' },
  { id: 'default-explore', icon: <DefaultCompassIcon />, label: 'Explore' },
  { id: 'default-notifications', icon: <DefaultBellIcon />, label: 'Notifications' },
];

type LimelightNavProps = {
  items?: NavItem[];
  activeIndex?: number;
  defaultActiveIndex?: number;
  onTabChange?: (index: number) => void;
  className?: string;
  limelightClassName?: string;
  iconContainerClassName?: string;
  iconClassName?: string;
};

/**
 * An adaptive-width navigation bar with a realistic "limelight" spotlight effect.
 * Uses emerald green with layered gradients for physical light simulation.
 */
export const LimelightNav = ({
  items = defaultNavItems,
  activeIndex: controlledActiveIndex,
  defaultActiveIndex = 0,
  onTabChange,
  className,
  limelightClassName,
  iconContainerClassName,
  iconClassName,
}: LimelightNavProps) => {
  const [internalActiveIndex, setInternalActiveIndex] = useState(defaultActiveIndex);
  const activeIndex = controlledActiveIndex !== undefined ? controlledActiveIndex : internalActiveIndex;
  const [isReady, setIsReady] = useState(false);
  const navItemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const limelightRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (items.length === 0) return;

    const limelight = limelightRef.current;
    const activeItem = navItemRefs.current[activeIndex];
    
    if (limelight && activeItem) {
      const newLeft = activeItem.offsetLeft + activeItem.offsetWidth / 2 - limelight.offsetWidth / 2;
      limelight.style.left = `${newLeft}px`;

      if (!isReady) {
        setTimeout(() => setIsReady(true), 50);
      }
    }
  }, [activeIndex, isReady, items]);

  if (items.length === 0) {
    return null; 
  }

  const handleItemClick = (index: number, itemOnClick?: () => void) => {
    setInternalActiveIndex(index);
    onTabChange?.(index);
    itemOnClick?.();
  };

  return (
    <nav className={`relative flex items-center h-16 rounded-lg px-2 w-full overflow-hidden ${className}`}>
      {/* Surface reflection — ambient glow on the nav bar surface */}
      <div
        className={`absolute top-0 left-0 right-0 h-full pointer-events-none ${
          isReady ? 'transition-opacity duration-500' : 'opacity-0'
        }`}
        style={{ opacity: isReady ? 1 : 0 }}
      >
        {/* Subtle ambient reflection on the entire nav surface */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.02] to-transparent" />
      </div>

      {items.map(({ id, icon, label, onClick }, index) => (
          <a
            key={id}
            ref={el => (navItemRefs.current[index] = el)}
            className={`relative z-20 flex h-full flex-1 cursor-pointer items-center justify-center p-5 ${iconContainerClassName}`}
            onClick={() => handleItemClick(index, onClick)}
            aria-label={label}
          >
            {cloneElement(icon, {
              className: `w-6 h-6 transition-all duration-300 ease-in-out ${
                activeIndex === index ? 'opacity-100 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'opacity-40'
              } ${icon.props.className || ''} ${iconClassName || ''}`,
            })}
          </a>
      ))}

      {/* === LIMELIGHT SPOTLIGHT === */}
      <div
        ref={limelightRef}
        className={`absolute top-0 z-10 ${
          isReady ? 'transition-[left] duration-400 ease-in-out' : ''
        }`}
        style={{ left: '-999px', width: '3rem' }}
      >
        {/* Main light bar — the emerald LED strip */}
        <div className={`w-full h-[4px] rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6),0_0_20px_4px_rgba(52,211,153,0.3)] ${limelightClassName}`} />
        
        {/* Primary light cone — narrow near source, wide at bottom */}
        <div
          className="absolute top-[4px] pointer-events-none"
          style={{
            left: '-40%',
            width: '180%',
            height: '60px',
            clipPath: 'polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)',
            background: 'linear-gradient(to bottom, rgba(52,211,153,0.25) 0%, rgba(52,211,153,0.06) 40%, transparent 100%)',
          }}
        />
        
        {/* Secondary soft glow — wider diffused light */}
        <div
          className="absolute top-[2px] pointer-events-none"
          style={{
            left: '-70%',
            width: '240%',
            height: '50px',
            clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
            background: 'radial-gradient(ellipse at top center, rgba(52,211,153,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Surface reflection spot — the light "hitting" the bar */}
        <div
          className="absolute top-[4px] pointer-events-none"
          style={{
            left: '-10%',
            width: '120%',
            height: '8px',
            background: 'radial-gradient(ellipse at center, rgba(52,211,153,0.15) 0%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      </div>
    </nav>
  );
};
