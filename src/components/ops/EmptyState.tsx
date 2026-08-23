import { Link } from "@tanstack/react-router";
import { Database, UploadCloud } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  message?: string;
}

export function EmptyState({
  title = "No Data Available",
  message = "It looks like you haven't uploaded the operational data yet. Please upload your CSV files to generate live insights.",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="bg-surface-2/50 p-4 rounded-full mb-4 border border-border">
        <Database className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{message}</p>
      
      <Link 
        to="/upload" 
        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2"
      >
        <UploadCloud className="w-4 h-4" />
        Go to Data Upload
      </Link>
    </div>
  );
}

export function SkeletonLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="bg-surface-2/50 p-4 rounded-full mb-4 border border-border animate-pulse">
        <Database className="w-8 h-8 text-muted-foreground/30" />
      </div>
      <h3 className="text-lg font-medium text-foreground/50 mb-1 animate-pulse">Loading data...</h3>
      <p className="text-sm text-muted-foreground/50 max-w-md animate-pulse">Fetching operational data from the server.</p>
    </div>
  );
}
