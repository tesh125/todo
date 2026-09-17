import { prisma } from "@/lib/prisma";
import { DEFAULT_WORK_END, DEFAULT_WORK_START } from "@/lib/timeBlocks";
import { SettingsDTO } from "@/lib/types";

const SINGLETON_ID = "singleton";

export async function getSettings(): Promise<SettingsDTO> {
  const settings = await prisma.settings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, workStartMinute: DEFAULT_WORK_START, workEndMinute: DEFAULT_WORK_END },
    update: {},
  });
  return { workStartMinute: settings.workStartMinute, workEndMinute: settings.workEndMinute };
}
