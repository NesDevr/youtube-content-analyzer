import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const panels = await prisma.panel.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ panels });
  } catch (error) {
    console.error("Panels error:", error);
    return NextResponse.json({ error: "Failed to fetch panels" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "create") {
      const panel = await prisma.panel.create({
        data: {
          name: body.name,
          keyword: body.keyword,
          filters: JSON.stringify(body.filters || {}),
        },
      });
      return NextResponse.json({ panel });
    }

    if (body.action === "refresh") {
      await prisma.panel.update({
        where: { id: body.id },
        data: { lastRefreshed: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Panel action error:", error);
    return NextResponse.json({ error: "Panel operation failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await prisma.panel.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete panel error:", error);
    return NextResponse.json({ error: "Failed to delete panel" }, { status: 500 });
  }
}
