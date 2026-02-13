'use client';

import { useRef, useState, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error = false,
  disabled = false,
  autoFocus = true,
}: OtpInputProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  // Auto-focus first input
  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Focus next empty input or last filled input
  useEffect(() => {
    const nextEmptyIndex = value.length < length ? value.length : length - 1;
    if (inputRefs.current[nextEmptyIndex]) {
      inputRefs.current[nextEmptyIndex]?.focus();
    }
  }, [value, length]);

  const handleChange = (index: number, inputValue: string) => {
    if (disabled) return;

    // Only accept numbers
    const digit = inputValue.replace(/[^0-9]/g, '').slice(-1);
    if (!digit && inputValue !== '') return;

    const newValue = value.split('');
    newValue[index] = digit;
    const updatedValue = newValue.join('').slice(0, length);
    onChange(updatedValue);

    // Move to next input if digit was entered
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      setActiveIndex(index + 1);
    }

    // Call onComplete when all digits are filled
    if (updatedValue.length === length && onComplete) {
      onComplete(updatedValue);
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      e.preventDefault();

      if (value[index]) {
        // Clear current digit
        const newValue = value.split('');
        newValue[index] = '';
        onChange(newValue.join(''));
      } else if (index > 0) {
        // Move to previous input and clear it
        inputRefs.current[index - 1]?.focus();
        setActiveIndex(index - 1);
        const newValue = value.split('');
        newValue[index - 1] = '';
        onChange(newValue.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setActiveIndex(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      setActiveIndex(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, length);

    if (pastedData) {
      onChange(pastedData);

      // Focus appropriate input after paste
      const focusIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      setActiveIndex(focusIndex);

      // Call onComplete if all digits are filled
      if (pastedData.length === length && onComplete) {
        setTimeout(() => onComplete(pastedData), 0);
      }
    }
  };

  const handleFocus = (index: number) => {
    setActiveIndex(index);
    // Select input content on focus
    inputRefs.current[index]?.select();
  };

  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={value[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={() => handleFocus(index)}
          disabled={disabled}
          className={cn(
            'w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold',
            'bg-[#2A2D3A] border-2 rounded-xl',
            'text-white placeholder:text-text-tertiary',
            'focus:outline-none transition-all duration-200',
            activeIndex === index
              ? 'border-section-primary ring-2 ring-section-primary/20'
              : 'border-white/10',
            error && 'border-error animate-shake',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
