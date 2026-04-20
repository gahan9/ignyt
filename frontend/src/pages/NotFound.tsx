import { Link } from "react-router-dom";

import { AlertCircleIcon } from "@/components/ui/Icons";

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-full bg-gray-100 p-3">
        <AlertCircleIcon className="h-6 w-6 text-gray-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">Page not found</h2>
      <p className="mt-1 text-sm text-gray-600">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to Engage
      </Link>
    </div>
  );
}
