import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";

export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();
        
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { message } = await request.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // Check if Gemini API key is configured
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) {
            return NextResponse.json(
                { error: "Gemini API key not configured" },
                { status: 500 }
            );
        }

        // Call Gemini API to understand the user's intent
        const model = "gemini-2.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `You are a helpful assistant that helps users create shapes on a drawing board. 
                                When a user requests a shape, extract the following information:
                                - shapeType: "rectangle", "square", or "circle"
                                - width: number (for rectangle and square)
                                - height: number (for rectangle only, for square it should equal width)
                                - radius: number (for circle, which will be used for both width and height as 2*radius)
                                - x: number (optional, default to 100)
                                - y: number (optional, default to 100)
                                
                                If the user doesn't provide dimensions, respond with a JSON object that has "needsDimensions": true and "shapeType" set.
                                If dimensions are provided, return a JSON object with all the shape properties.
                                
                                Always respond with valid JSON only, no additional text.
                                
                                User request: ${message}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 200,
                },
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("Gemini API error:", errorData);
            return NextResponse.json(
                { error: "Failed to process request" },
                { status: 500 }
            );
        }

        const data = await response.json();
        const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Try to parse the JSON response
        let parsedResponse;
        try {
            // Extract JSON from the response (in case there's extra text)
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseError) {
            console.error("Failed to parse AI response:", aiResponse);
            return NextResponse.json(
                { error: "Failed to parse AI response" },
                { status: 500 }
            );
        }

        return NextResponse.json(parsedResponse);
    } catch (error) {
        console.error("Error in generate-shape API:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
