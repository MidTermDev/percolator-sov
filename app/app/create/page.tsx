import { CreateMarketWizard } from "@/components/create/CreateMarketWizard";

export default function CreatePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Create Market</h1>
      <CreateMarketWizard />
    </main>
  );
}
