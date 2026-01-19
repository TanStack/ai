<?php

namespace TanStack\AI;

/**
 * Tool/Function definition for function calling.
 * 
 * Tools allow the model to interact with external systems, APIs, or perform computations.
 * The model will decide when to call tools based on the user's request and the tool descriptions.
 */
class Tool
{
    /**
     * Unique name of the tool (used by the model to call it).
     * 
     * @var string
     */
    public string $name;

    /**
     * Clear description of what the tool does.
     * This is crucial - the model uses this to decide when to call the tool.
     * 
     * @var string
     */
    public string $description;

    /**
     * JSON Schema describing the tool's input parameters.
     * Defines the structure and types of arguments the tool accepts.
     * 
     * @var array|null
     */
    public ?array $inputSchema;

    /**
     * Optional JSON Schema for validating tool output.
     * 
     * @var array|null
     */
    public ?array $outputSchema;

    /**
     * Optional function to execute when the model calls this tool.
     * If provided, the SDK will automatically execute the function with the model's arguments
     * and feed the result back to the model.
     * 
     * @var callable|null
     */
    public $execute;

    /**
     * If true, tool execution requires user approval before running.
     * 
     * @var bool
     */
    public bool $needsApproval;

    /**
     * Additional metadata for adapters or custom extensions.
     * 
     * @var array
     */
    public array $metadata;

    /**
     * Create a new Tool instance.
     * 
     * @param string $name Unique name of the tool
     * @param string $description Clear description of what the tool does
     * @param array|null $inputSchema JSON Schema for input parameters
     * @param callable|null $execute Function to execute when called
     * @param bool $needsApproval Whether tool requires user approval
     * @param array|null $outputSchema JSON Schema for output validation
     * @param array $metadata Additional metadata
     */
    public function __construct(
        string $name,
        string $description,
        ?array $inputSchema = null,
        ?callable $execute = null,
        bool $needsApproval = false,
        ?array $outputSchema = null,
        array $metadata = []
    ) {
        $this->name = $name;
        $this->description = $description;
        $this->inputSchema = $inputSchema;
        $this->execute = $execute;
        $this->needsApproval = $needsApproval;
        $this->outputSchema = $outputSchema;
        $this->metadata = $metadata;
    }

    /**
     * Create a Tool from an array definition.
     * 
     * @param array $definition Tool definition array
     * @return self
     */
    public static function fromArray(array $definition): self
    {
        return new self(
            name: $definition['name'] ?? '',
            description: $definition['description'] ?? '',
            inputSchema: $definition['inputSchema'] ?? null,
            execute: $definition['execute'] ?? null,
            needsApproval: $definition['needsApproval'] ?? false,
            outputSchema: $definition['outputSchema'] ?? null,
            metadata: $definition['metadata'] ?? []
        );
    }

    /**
     * Convert tool to array representation.
     * 
     * @return array
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'description' => $this->description,
            'inputSchema' => $this->inputSchema,
            'outputSchema' => $this->outputSchema,
            'needsApproval' => $this->needsApproval,
            'metadata' => $this->metadata,
            // Note: execute is not serialized as it's a callable
        ];
    }
}
