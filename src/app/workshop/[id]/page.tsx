/**
 * Workshop canvas route — pulls everything together.
 * See Design_v1.md §C.2.
 */

"use client";

import { use } from "react";
import { WorkshopCanvas } from "@/components/canvas/WorkshopCanvas";

export default function WorkshopPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <WorkshopCanvas workshopId={id} />;
}
