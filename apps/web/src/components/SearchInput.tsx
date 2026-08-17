import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  iconSize?: number;
  autoFocus?: boolean;
}

export default function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  iconSize = 14,
  autoFocus,
}: SearchInputProps) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border border-white/[.06] bg-black/20 px-3 ${className}`}>
      <Search size={iconSize} className="flex-shrink-0 text-zinc-700" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-transparent py-3 text-xs text-white outline-none placeholder:text-zinc-800 ${inputClassName}`}
      />
    </div>
  );
}
