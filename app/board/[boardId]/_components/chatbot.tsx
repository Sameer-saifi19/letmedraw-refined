"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation } from "@/liveblocks.config";
import { nanoid } from "nanoid";
import { LiveObject } from "@liveblocks/client";
import { LayerType, Point, Color } from "@/types/canvas";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
}

interface ChatbotProps {
    lastUsedColor: Color;
    camera: { x: number; y: number };
}

const MAX_LAYERS = 100;

export const Chatbot = ({ lastUsedColor, camera }: ChatbotProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            role: "assistant",
            content: "Hi! I can help you create shapes and text on the board. Try saying 'create a red rectangle' or 'add text Hello World' or 'create a blue circle'.",
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [pendingShape, setPendingShape] = useState<{
        shapeType: "rectangle" | "square" | "circle";
        needsWidth?: boolean;
        needsHeight?: boolean;
        needsRadius?: boolean;
        color?: Color;
    } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const insertLayer = useMutation(
        (
            { storage, setMyPresence },
            layerType: LayerType.Rectangle | LayerType.Ellipse | LayerType.Text,
            position: Point,
            width: number,
            height: number,
            color?: Color,
            textValue?: string
        ) => {
            const liveLayers = storage.get("layers");
            if (liveLayers.size >= MAX_LAYERS) {
                return;
            }

            const liveLayerIds = storage.get("layerIds");
            const layerId = nanoid();
            const fillColor = color || lastUsedColor;
            
            const layer = new LiveObject({
                type: layerType,
                x: position.x,
                y: position.y,
                height,
                width,
                fill: fillColor,
                ...(textValue && { value: textValue }),
            });

            liveLayerIds.push(layerId);
            liveLayers.set(layerId, layer);

            setMyPresence({ selection: [layerId] }, { addToHistory: true });
        },
        [lastUsedColor]
    );

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const addMessage = (role: "user" | "assistant", content: string) => {
        setMessages((prev) => [
            ...prev,
            {
                id: nanoid(),
                role,
                content,
            },
        ]);
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput("");
        addMessage("user", userMessage);
        setIsLoading(true);

        try {
            // If we're waiting for dimensions, parse the input as dimensions
            if (pendingShape) {
                const numbers = userMessage.match(/\d+/g);
                
                // Calculate position based on camera to place shape in visible area
                const position: Point = { 
                    x: -camera.x + 200, 
                    y: -camera.y + 200 
                };

                const color = pendingShape.color || lastUsedColor;

                if (pendingShape.needsRadius && numbers && numbers.length > 0) {
                    const radius = parseInt(numbers[0]);
                    if (radius > 0) {
                        insertLayer(
                            LayerType.Ellipse,
                            position,
                            radius * 2,
                            radius * 2,
                            color
                        );
                        addMessage(
                            "assistant",
                            `Great! I've created a circle with radius ${radius}px.`
                        );
                        setPendingShape(null);
                    } else {
                        addMessage(
                            "assistant",
                            "Please provide a valid radius (a positive number)."
                        );
                    }
                } else if (pendingShape.needsWidth && pendingShape.needsHeight) {
                    // Rectangle needs both width and height
                    if (numbers && numbers.length >= 2) {
                        const width = parseInt(numbers[0]);
                        const height = parseInt(numbers[1]);
                        if (width > 0 && height > 0) {
                            insertLayer(
                                LayerType.Rectangle,
                                position,
                                width,
                                height,
                                color
                            );
                            addMessage(
                                "assistant",
                                `Perfect! I've created a ${pendingShape.shapeType} with width ${width}px and height ${height}px.`
                            );
                            setPendingShape(null);
                        } else {
                            addMessage(
                                "assistant",
                                "Please provide valid dimensions (two positive numbers)."
                            );
                        }
                    } else {
                        addMessage(
                            "assistant",
                            "Please provide both width and height as two numbers (e.g., '200 150')."
                        );
                    }
                } else if (pendingShape.needsWidth) {
                    // Square needs only width (height = width)
                    if (numbers && numbers.length > 0) {
                        const size = parseInt(numbers[0]);
                        if (size > 0) {
                            insertLayer(
                                LayerType.Rectangle,
                                position,
                                size,
                                size,
                                color
                            );
                            addMessage(
                                "assistant",
                                `Perfect! I've created a square with size ${size}px.`
                            );
                            setPendingShape(null);
                        } else {
                            addMessage(
                                "assistant",
                                "Please provide a valid size (a positive number)."
                            );
                        }
                    } else {
                        addMessage(
                            "assistant",
                            "Please provide a size as a number (e.g., '100')."
                        );
                    }
                }
                setIsLoading(false);
                return;
            }

            // Call the AI API
            const response = await fetch("/api/ai/generate-shape", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message: userMessage }),
            });

            if (!response.ok) {
                throw new Error("Failed to process request");
            }

            const data = await response.json();

            // Handle text creation
            if (data.actionType === "text") {
                const text = data.text || "Text";
                const color = data.color || lastUsedColor;
                const x = data.x !== undefined ? data.x : -camera.x + 200;
                const y = data.y !== undefined ? data.y : -camera.y + 200;
                const position: Point = { x, y };

                // Default text dimensions
                const width = 200;
                const height = 100;

                insertLayer(LayerType.Text, position, width, height, color, text);
                addMessage(
                    "assistant",
                    `Perfect! I've created text "${text}" on the board.`
                );
            }
            // Check if dimensions are needed for shapes
            else if (data.needsDimensions) {
                const shapeType = data.shapeType;
                const color = data.color || lastUsedColor;
                
                if (shapeType === "circle") {
                    setPendingShape({
                        shapeType: "circle",
                        needsRadius: true,
                        color,
                    });
                    addMessage(
                        "assistant",
                        "What radius would you like for the circle? (e.g., '50')"
                    );
                } else if (shapeType === "square") {
                    setPendingShape({
                        shapeType: "square",
                        needsWidth: true,
                        color,
                    });
                    addMessage(
                        "assistant",
                        "What size would you like for the square? (e.g., '100')"
                    );
                } else if (shapeType === "rectangle") {
                    setPendingShape({
                        shapeType: "rectangle",
                        needsWidth: true,
                        needsHeight: true,
                        color,
                    });
                    addMessage(
                        "assistant",
                        "What width and height would you like for the rectangle? (e.g., '200 150')"
                    );
                }
            } else {
                // All dimensions provided, create the shape
                const shapeType = data.shapeType;
                const width = data.width || 100;
                const height = data.height || 100;
                const color = data.color || lastUsedColor;
                // Use provided position or calculate based on camera
                const x = data.x !== undefined ? data.x : -camera.x + 200;
                const y = data.y !== undefined ? data.y : -camera.y + 200;

                const position: Point = { x, y };

                if (shapeType === "circle") {
                    insertLayer(LayerType.Ellipse, position, width, height, color);
                    addMessage(
                        "assistant",
                        `Great! I've created a circle with radius ${width / 2}px.`
                    );
                } else {
                    insertLayer(LayerType.Rectangle, position, width, height, color);
                    addMessage(
                        "assistant",
                        `Perfect! I've created a ${shapeType} with width ${width}px and height ${height}px.`
                    );
                }
                setPendingShape(null);
            }
        } catch (error) {
            console.error("Error:", error);
            addMessage(
                "assistant",
                "Sorry, I encountered an error. Please try again."
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <>
            {!isOpen && (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-4 right-4 rounded-full w-20 h-20 shadow-lg z-50"
                    size="icon"
                >
                    <div className="flex flex-col items-center justify-center">
                    <h4 className="text-xl font-bold">AI</h4>
                    <MessageSquare className="h-8 w-8" />
                    </div>
                </Button>
            )}

            {isOpen && (
                <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col border border-gray-200">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200">
                        <h3 className="font-semibold text-lg">Shape Assistant</h3>
                        <Button
                            onClick={() => {
                                setIsOpen(false);
                                setPendingShape(null);
                            }}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${
                                    message.role === "user"
                                        ? "justify-end"
                                        : "justify-start"
                                }`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                        message.role === "user"
                                            ? "bg-blue-500 text-white"
                                            : "bg-gray-100 text-gray-800"
                                    }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap">
                                        {message.content}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-lg px-4 py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-gray-200">
                        <div className="flex gap-2">
                            <Input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={
                                    pendingShape
                                        ? "Enter dimensions..."
                                        : "Type your message..."
                                }
                                disabled={isLoading}
                                className="flex-1"
                            />
                            <Button
                                onClick={handleSendMessage}
                                disabled={isLoading || !input.trim()}
                                size="icon"
                            >
                                {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
