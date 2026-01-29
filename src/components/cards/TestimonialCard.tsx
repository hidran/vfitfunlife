'use client';

import Image from 'next/image';
import { Star, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TestimonialCardProps {
  userName: string;
  userAvatar: string;
  rating: number;
  comment: string;
  serviceName: string;
  venueName: string;
  date: string;
  className?: string;
}

export function TestimonialCard({
  userName,
  userAvatar,
  rating,
  comment,
  serviceName,
  venueName,
  date,
  className,
}: TestimonialCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col p-5 rounded-2xl',
        'bg-white/5 border border-white/10',
        'min-w-[300px] max-w-[320px]',
        className
      )}
    >
      {/* Quote Icon */}
      <div className="absolute top-4 right-4 opacity-20">
        <Quote className="w-8 h-8 text-vlife-primary" />
      </div>

      {/* User Info */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-vlife-primary/30">
          <Image
            src={userAvatar}
            alt={userName}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-text-inverse text-sm">{userName}</p>
          <p className="text-text-tertiary text-xs">{date}</p>
        </div>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              'w-4 h-4',
              i < rating ? 'text-vlife-accent fill-vlife-accent' : 'text-white/20'
            )}
          />
        ))}
      </div>

      {/* Comment */}
      <p className="text-text-inverse/90 text-sm leading-relaxed mb-4 flex-1 line-clamp-3">
        &ldquo;{comment}&rdquo;
      </p>

      {/* Service & Venue */}
      <div className="pt-3 border-t border-white/10">
        <p className="text-vlife-primary text-xs font-medium">{serviceName}</p>
        <p className="text-text-tertiary text-xs">{venueName}</p>
      </div>
    </div>
  );
}

export default TestimonialCard;
