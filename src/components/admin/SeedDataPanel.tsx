"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { 
  Database, 
  Trash2, 
  Zap, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  RefreshCw
} from "lucide-react";

interface SeedingResult {
  success: boolean;
  summary?: {
    totalCollections: number;
    successful: number;
    failed: number;
    totalRecords?: number;
    totalDeleted?: number;
  };
  details?: Array<{
    success: boolean;
    collection: string;
    count: number;
    error?: string;
  }>;
  message?: string;
  error?: string;
}

export function SeedDataPanel() {
  const { firebaseUser } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<SeedingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callSeedFunction = async (functionName: string): Promise<SeedingResult> => {
    if (!firebaseUser) {
      throw new Error("Not authenticated");
    }

    // Get fresh ID token
    const idToken = await firebaseUser.getIdToken(true);
    
    // Use direct HTTP call instead of callable for better control
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  };

  const handleSeedQuick = async () => {
    setLoading("quick");
    setError(null);
    setResult(null);
    
    try {
      const result = await callSeedFunction("seedQuickData");
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleSeedAll = async () => {
    setLoading("all");
    setError(null);
    setResult(null);
    
    try {
      const result = await callSeedFunction("seedAllData");
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("⚠️ WARNING: This will delete ALL data from users, venues, classes, bookings, and reviews collections. This action cannot be undone. Are you sure?")) {
      return;
    }
    
    setLoading("clear");
    setError(null);
    setResult(null);
    
    try {
      const result = await callSeedFunction("clearAllData");
      setResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white">Demo Data Management</h2>
        <p className="text-gray-400 mt-1">
          Seed or clear demo data for testing and development purposes.
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Quick Seed */}
        <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Quick Seed</h3>
              <p className="text-xs text-gray-400">Minimal data for quick testing</p>
            </div>
          </div>
          
          <ul className="text-sm text-gray-400 space-y-1 mb-4">
            <li>• 3 Providers</li>
            <li>• 2 Customers</li>
            <li>• 3 Venues</li>
            <li>• 5 Classes</li>
            <li>• 5 Bookings</li>
            <li>• 3 Reviews</li>
          </ul>
          
          <Button
            onClick={handleSeedQuick}
            disabled={loading === "quick"}
            variant="secondary"
            fullWidth
          >
            {loading === "quick" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Seed Quick Data
              </>
            )}
          </Button>
        </div>

        {/* Full Seed */}
        <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Database className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Full Seed</h3>
              <p className="text-xs text-gray-400">Comprehensive demo dataset</p>
            </div>
          </div>
          
          <ul className="text-sm text-gray-400 space-y-1 mb-4">
            <li>• 10+ Providers</li>
            <li>• 15+ Customers</li>
            <li>• 8+ Venues</li>
            <li>• 20+ Classes</li>
            <li>• 30+ Bookings</li>
            <li>• 20+ Reviews</li>
          </ul>
          
          <Button
            onClick={handleSeedAll}
            disabled={loading === "all"}
            variant="primary"
            fullWidth
          >
            {loading === "all" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Seed All Data
              </>
            )}
          </Button>
        </div>

        {/* Clear Data */}
        <div className="bg-[#2A2D3A] rounded-xl border border-white/5 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Clear All</h3>
              <p className="text-xs text-gray-400">Remove all demo data</p>
            </div>
          </div>
          
          <ul className="text-sm text-gray-400 space-y-1 mb-4">
            <li className="text-red-400">• ⚠️ Deletes all users</li>
            <li className="text-red-400">• ⚠️ Deletes all venues</li>
            <li className="text-red-400">• ⚠️ Deletes all classes</li>
            <li className="text-red-400">• ⚠️ Deletes all bookings</li>
            <li className="text-red-400">• ⚠️ Deletes all reviews</li>
          </ul>
          
          <Button
            onClick={handleClearAll}
            disabled={loading === "clear"}
            variant="ghost"
            className="w-full border border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            {loading === "clear" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Data
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-400">Error</h4>
            <p className="text-sm text-red-300 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Success Result */}
      {result?.success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <h4 className="font-medium text-green-400">Success</h4>
          </div>
          
          {result.message && (
            <p className="text-sm text-green-300 mb-3">{result.message}</p>
          )}
          
          {result.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">
                  {result.summary.totalCollections}
                </p>
                <p className="text-xs text-gray-400">Collections</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-400">
                  {result.summary.successful}
                </p>
                <p className="text-xs text-gray-400">Successful</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-white">
                  {result.summary.totalRecords ?? result.summary.totalDeleted ?? 0}
                </p>
                <p className="text-xs text-gray-400">
                  {result.summary.totalRecords ? "Records" : "Deleted"}
                </p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">
                  {result.summary.failed}
                </p>
                <p className="text-xs text-gray-400">Failed</p>
              </div>
            </div>
          )}
          
          {/* Details */}
          {result.details && result.details.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-white mb-2">Details:</p>
              <div className="space-y-1">
                {result.details.map((detail) => (
                  <div
                    key={detail.collection}
                    className="flex items-center justify-between text-sm py-1 px-2 rounded bg-black/20"
                  >
                    <span className="text-gray-300 capitalize">
                      {detail.collection}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">
                        {detail.count}
                      </span>
                      {detail.success ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
