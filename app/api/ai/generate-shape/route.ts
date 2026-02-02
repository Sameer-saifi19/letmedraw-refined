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
                                text: `You are a helpful assistant that helps users create shapes and text on a drawing board. 
                                When a user requests a shape or text, extract the following information:
                                
                                For shapes (rectangle, square, circle):
                                - actionType: "shape"
                                - shapeType: "rectangle", "square", or "circle"
                                - width: number (for rectangle and square)
                                - height: number (for rectangle only, for square it should equal width)
                                - radius: number (for circle, which will be used for both width and height as 2*radius)
                                - color: object with r, g, b values (0-255) - extract from color names like "red", "blue", "green", "yellow", "purple", "orange", "pink", "black", "white", "gray", etc. If no color specified, use null.
                                - x: number (optional, default to 100)
                                - y: number (optional, default to 100)
                                
                                For text:
                                - actionType: "text"
                                - text: string (the text content to create)
                                - color: object with r, g, b values (0-255) - extract from color names. If no color specified, use null.
                                - x: number (optional, default to 100)
                                - y: number (optional, default to 100)
                                
                                Color mapping examples:
                                - "red" -> {r: 255, g: 0, b: 0}
                                - "blue" -> {r: 0, g: 0, b: 255}
                                - "green" -> {r: 0, g: 255, b: 0}
                                - "yellow" -> {r: 255, g: 255, b: 0}
                                - "purple" -> {r: 128, g: 0, b: 128}
                                - "orange" -> {r: 255, g: 165, b: 0}
                                - "pink" -> {r: 255, g: 192, b: 203}
                                - "black" -> {r: 0, g: 0, b: 0}
                                - "white" -> {r: 255, g: 255, b: 255}
                                - "gray" or "grey" -> {r: 128, g: 128, b: 128}
                                
                                If the user doesn't provide dimensions for a shape, respond with a JSON object that has "needsDimensions": true and "shapeType" set.
                                If dimensions are provided, return a JSON object with all the properties.
                                
                                Always respond with valid JSON only, no additional text.
                                
                                User request: ${message}`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 300,
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
