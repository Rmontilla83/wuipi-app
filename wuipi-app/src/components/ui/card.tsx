import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-wuipi-card border border-wuipi-border rounded-2xl p-6",
        hover && "cursor-pointer hover:border-wuipi-accent/40 hover:bg-wuipi-card-hover transition-all",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
